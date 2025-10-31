const DEFAULT_TIERS = [
  {
    id: 'outpost',
    label: 'Outpost',
    populationTarget: 40,
    growthRate: 0.03,
  },
  {
    id: 'settlement',
    label: 'Settlement',
    populationTarget: 120,
    growthRate: 0.045,
  },
  {
    id: 'district',
    label: 'District',
    populationTarget: 360,
    growthRate: 0.06,
  },
  {
    id: 'arcology',
    label: 'Arcology',
    populationTarget: Infinity,
    growthRate: 0.08,
  },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export default class MicroCityEngine {
  constructor(options = {}) {
    const {
      tiers = DEFAULT_TIERS,
      initialPopulation = 12,
      timeScale = 24,
      sleepCycleHours = 8,
      structureGenerators = {},
      visualContext = {},
      randomSeed = 1337,
    } = options;

    this.tiers = tiers.map((tier, index) => ({
      index,
      ...tier,
    }));

    this.population = initialPopulation;
    this.totalHours = 0;
    this.completedSleepCycles = 0;
    this.timeScale = timeScale; // in-simulation hours per real-time second
    this.timeDilation = 1;
    this.sleepCycleHours = sleepCycleHours;
    this.structureGenerators = structureGenerators;
    this.structures = [];
    this.events = new Map();
    this.visualContext = visualContext;

    this._rng = mulberry32(randomSeed);

    const startingTierIndex = this._resolveTierIndex(this.population);
    this.currentTierIndex = startingTierIndex;
    this._emit('tier:ready', {
      tier: this.getCurrentTier(),
      population: this.population,
    });
    this._spawnTierStructures(this.getCurrentTier());
  }

  setTimeScale(hoursPerSecond) {
    this.timeScale = hoursPerSecond;
  }

  setTimeDilation(multiplier) {
    this.timeDilation = multiplier;
  }

  setSleepCycleHours(hours) {
    this.sleepCycleHours = Math.max(1, hours);
  }

  setVisualContext(context = {}) {
    this.visualContext = context;
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
  }

  off(event, handler) {
    if (!this.events.has(event)) {
      return;
    }
    this.events.get(event).delete(handler);
  }

  advance(realSeconds, options = {}) {
    const effectiveMultiplier = options.timeDilation ?? this.timeDilation;
    const hoursAdvanced = realSeconds * this.timeScale * effectiveMultiplier;
    return this._advanceHours(hoursAdvanced);
  }

  advanceSleepCycles(cycles = 1) {
    const hoursAdvanced = this.sleepCycleHours * cycles;
    return this._advanceHours(hoursAdvanced);
  }

  getCurrentTier() {
    return this.tiers[this.currentTierIndex];
  }

  getNextTier() {
    const next = this.tiers[this.currentTierIndex + 1];
    return next || null;
  }

  getSimulationHours() {
    return this.totalHours;
  }

  getPopulation() {
    return this.population;
  }

  getCompletedSleepCycles() {
    return this.completedSleepCycles;
  }

  getStructures() {
    return [...this.structures];
  }

  getCitySnapshot() {
    return {
      timeHours: this.totalHours,
      population: this.population,
      completedSleepCycles: this.completedSleepCycles,
      tier: this.getCurrentTier(),
      nextTier: this.getNextTier(),
      structures: this.getStructures(),
    };
  }

  _advanceHours(hoursAdvanced) {
    if (!Number.isFinite(hoursAdvanced) || hoursAdvanced <= 0) {
      return this.getCitySnapshot();
    }

    const previousCycles = this.completedSleepCycles;
    this.totalHours += hoursAdvanced;

    this._growPopulation(hoursAdvanced);
    this._updateSleepCycles();
    this._maybeAdvanceTier();

    if (this.completedSleepCycles > previousCycles) {
      this._emit('sleep:completed', {
        totalCycles: this.completedSleepCycles,
        deltaCycles: this.completedSleepCycles - previousCycles,
        snapshot: this.getCitySnapshot(),
      });
    }

    this._emit('tick', this.getCitySnapshot());
    return this.getCitySnapshot();
  }

  _growPopulation(hoursAdvanced) {
    const tier = this.getCurrentTier();
    const hourlyGrowthRate = tier.growthRate;

    // use compound growth with soft cap approaching next tier target
    const nextTier = this.getNextTier();
    const target = nextTier ? nextTier.populationTarget : this.population * 2 + 1;
    const carryingCapacity = Math.max(target, this.population + 1);

    const fractionalPopulation = this.population;
    const growthPerHour = hourlyGrowthRate * (1 - fractionalPopulation / carryingCapacity);
    const newPopulation = fractionalPopulation + fractionalPopulation * growthPerHour * hoursAdvanced;
    this.population = Math.max(0, newPopulation);
  }

  _updateSleepCycles() {
    const cycles = Math.floor(this.totalHours / this.sleepCycleHours);
    if (cycles !== this.completedSleepCycles) {
      this.completedSleepCycles = cycles;
    }
  }

  _maybeAdvanceTier() {
    const newTierIndex = this._resolveTierIndex(this.population);
    if (newTierIndex > this.currentTierIndex) {
      for (let tierIndex = this.currentTierIndex + 1; tierIndex <= newTierIndex; tierIndex += 1) {
        this.currentTierIndex = tierIndex;
        const tier = this.getCurrentTier();
        this._emit('tier:advanced', {
          tier,
          snapshot: this.getCitySnapshot(),
        });
        this._spawnTierStructures(tier);
      }
    }
  }

  _spawnTierStructures(tier) {
    const generator = this.structureGenerators[tier.id];
    if (typeof generator !== 'function') {
      return;
    }

    const context = {
      tier,
      population: this.population,
      totalHours: this.totalHours,
      rng: this._rng,
      visualContext: this.visualContext,
      engine: this,
    };

    const result = generator(context);
    if (!result) {
      return;
    }

    const structures = Array.isArray(result) ? result : [result];
    structures.forEach((structure) => {
      this.structures.push({
        tier: tier.id,
        structure,
      });
      this._emit('structure:spawned', {
        tier,
        structure,
        snapshot: this.getCitySnapshot(),
      });
    });
  }

  _resolveTierIndex(population) {
    let tierIndex = 0;
    for (let i = 0; i < this.tiers.length; i += 1) {
      if (population >= this.tiers[i].populationTarget) {
        tierIndex = i;
      } else {
        break;
      }
    }
    return tierIndex;
  }

  _emit(event, payload) {
    if (!this.events.has(event)) {
      return;
    }
    this.events.get(event).forEach((handler) => handler(payload));
  }
}

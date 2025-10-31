const ROOM_MODES = Object.freeze({
  PROXY: "proxy",
  REAL: "real"
});

export { ROOM_MODES };

export default class RoomModeController {
  #roomsIndex;
  #mode;
  #seedCache = new Map();
  #activeRooms = new Map();
  #listeners = new Map();
  #instantiateProxy;
  #instantiateReal;
  #seedProvider;

  constructor({
    roomsIndex,
    instantiateProxyRoom,
    instantiateRealRoom,
    defaultMode = ROOM_MODES.PROXY,
    seedProvider
  } = {}) {
    if (!roomsIndex || typeof roomsIndex !== "object") {
      throw new Error("RoomModeController requires a roomsIndex map");
    }

    this.#roomsIndex = roomsIndex;
    this.#instantiateProxy =
      instantiateProxyRoom ?? ((roomId, metadata, seed) => ({ roomId, metadata, seed }));
    this.#instantiateReal =
      instantiateRealRoom ?? ((roomId, metadata, seed) => ({ roomId, metadata, seed }));
    this.#seedProvider =
      seedProvider ?? ((roomId, metadata) => metadata?.furnishingSeed ?? this.#hashSeed(roomId));

    this.#mode = this.#coerceMode(defaultMode ?? ROOM_MODES.PROXY);
  }

  get mode() {
    return this.#mode;
  }

  getMode() {
    return this.#mode;
  }

  setMode(mode, { reinstantiate = true } = {}) {
    const nextMode = this.#coerceMode(mode ?? this.#mode);
    if (nextMode === this.#mode) {
      return this.#mode;
    }

    this.#mode = nextMode;

    if (reinstantiate) {
      for (const roomId of Array.from(this.#activeRooms.keys())) {
        this.instantiate(roomId, { remember: false });
      }
    }

    this.#emit("modechange", { mode: this.#mode });
    return this.#mode;
  }

  toggleMode() {
    const next = this.#mode === ROOM_MODES.PROXY ? ROOM_MODES.REAL : ROOM_MODES.PROXY;
    return this.setMode(next);
  }

  instantiate(roomId, { remember = true } = {}) {
    const metadata = this.getRoomMetadata(roomId);
    if (!metadata) {
      throw new Error(`Unknown room id: ${roomId}`);
    }

    const seed = this.#resolveSeed(roomId, metadata);
    const creator = this.#mode === ROOM_MODES.PROXY ? this.#instantiateProxy : this.#instantiateReal;
    const instance = creator(roomId, metadata, seed, this.#mode);

    if (remember === false && this.#activeRooms.has(roomId)) {
      const record = this.#activeRooms.get(roomId);
      record.metadata = metadata;
      record.seed = seed;
      record.instance = instance;
      record.mode = this.#mode;
    } else {
      this.#activeRooms.set(roomId, { metadata, seed, instance, mode: this.#mode });
    }

    this.#emit("instantiate", { roomId, mode: this.#mode, seed, metadata, instance });
    return instance;
  }

  destroy(roomId) {
    const record = this.#activeRooms.get(roomId);
    if (!record) {
      return false;
    }

    this.#activeRooms.delete(roomId);
    this.#emit("destroy", { roomId, metadata: record.metadata });
    return true;
  }

  getSeed(roomId) {
    return this.#seedCache.get(roomId) ?? null;
  }

  getRoomMetadata(roomId) {
    return this.#roomsIndex?.[roomId] ?? null;
  }

  listActiveRooms() {
    return Array.from(this.#activeRooms.keys());
  }

  resetSeeds(roomId) {
    if (roomId) {
      this.#seedCache.delete(roomId);
      return;
    }

    this.#seedCache.clear();
  }

  on(eventName, handler) {
    if (!this.#listeners.has(eventName)) {
      this.#listeners.set(eventName, new Set());
    }

    this.#listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.#listeners.delete(eventName);
    }
  }

  #emit(eventName, payload) {
    const handlers = this.#listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`RoomModeController listener for ${eventName} failed`, error);
      }
    });
  }

  #resolveSeed(roomId, metadata) {
    if (this.#seedCache.has(roomId)) {
      return this.#seedCache.get(roomId);
    }

    const nextSeed = this.#seedProvider(roomId, metadata);
    this.#seedCache.set(roomId, nextSeed);
    return nextSeed;
  }

  #coerceMode(mode) {
    const value = typeof mode === "string" ? mode.toLowerCase() : mode;
    if (value === ROOM_MODES.PROXY || value === ROOM_MODES.REAL) {
      return value;
    }

    throw new Error(`Unsupported room mode: ${mode}`);
  }

  #hashSeed(value) {
    const input = String(value ?? "");
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }

    const normalized = Math.abs(hash % 1000000);
    return normalized + 1;
  }
}

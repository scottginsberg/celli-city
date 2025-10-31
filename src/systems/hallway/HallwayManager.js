/**
 * HallwayManager coordinates door selection, elevator routing, and lightweight
 * geometry streaming for hallway segments that connect lobby spaces.
 */

const CustomEventCtor = typeof CustomEvent !== "undefined"
  ? CustomEvent
  : class CustomEventPolyfill {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    };

class SimpleEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    if (!this.listeners.has(type)) {
      return;
    }
    this.listeners.get(type).delete(callback);
  }

  dispatchEvent(event) {
    const callbacks = this.listeners.get(event.type);
    if (!callbacks) {
      return true;
    }
    callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        setTimeout(() => {
          throw error;
        }, 0);
      }
    });
    return true;
  }
}

function createEventTarget(provided) {
  if (provided) {
    return provided;
  }
  if (typeof EventTarget !== "undefined") {
    return new EventTarget();
  }
  return new SimpleEventTarget();
}

function defaultGeometryStreamer(source) {
  const { hallwayId, sections = [] } = source;
  const timestamp = Date.now();
  return sections.map((section) => ({
    id: section.id,
    detail: section.detail ?? "generic-section",
    hallwayId,
    streamedAt: timestamp,
  }));
}

export class HallwayManager {
  constructor(options = {}) {
    const { eventTarget, geometryStreamer = defaultGeometryStreamer } = options;
    this._eventTarget = createEventTarget(eventTarget);
    this._geometryStreamer = geometryStreamer;

    this._hallways = new Map();
    this._streamedSections = new Map();
    this._activeHallwayId = null;
    this._activeDoorId = null;
    this._connectedLobbyId = null;
  }

  registerHallway(hallwayId, config = {}) {
    if (!hallwayId) {
      throw new Error("hallwayId is required to register hallway data.");
    }
    const normalized = {
      ...config,
      id: hallwayId,
      doors: Array.isArray(config.doors) ? [...config.doors] : [],
      elevators: Array.isArray(config.elevators) ? [...config.elevators] : [],
      sections: Array.isArray(config.sections) ? [...config.sections] : [],
    };
    this._hallways.set(hallwayId, normalized);
    this._dispatch("hallway:registered", { hallwayId, config: normalized });
  }

  unregisterHallway(hallwayId) {
    if (this._hallways.delete(hallwayId)) {
      this._dispatch("hallway:unregistered", { hallwayId });
    }
  }

  getActiveHallwayId() {
    return this._activeHallwayId;
  }

  getActiveDoorId() {
    return this._activeDoorId;
  }

  getConnectedLobbyId() {
    return this._connectedLobbyId;
  }

  getHallway(hallwayId) {
    return this._hallways.get(hallwayId) ?? null;
  }

  findDoor(doorId) {
    for (const [hallwayId, hallway] of this._hallways.entries()) {
      const door = hallway.doors.find((entry) => entry.id === doorId);
      if (door) {
        return { hallwayId, door, hallway };
      }
    }
    return null;
  }

  selectDoor(hallwayId, options = {}) {
    const hallway = this._hallways.get(hallwayId);
    if (!hallway) {
      throw new Error(`Unknown hallway "${hallwayId}".`);
    }
    const { preferredDoorId, lobbyId } = options;
    let candidate = null;
    if (preferredDoorId) {
      candidate = hallway.doors.find((door) => door.id === preferredDoorId) ?? null;
    }
    if (!candidate) {
      candidate = hallway.doors.find((door) => !lobbyId || door.connectedLobbyId === lobbyId) ?? null;
    }
    if (!candidate) {
      candidate = hallway.doors[0] ?? null;
    }
    if (!candidate) {
      throw new Error(`Hallway "${hallwayId}" does not have any doors.`);
    }
    this._dispatch("hallway:door-selected", { hallwayId, door: candidate });
    return candidate;
  }

  routeElevator(hallwayId, targetFloor) {
    const hallway = this._hallways.get(hallwayId);
    if (!hallway) {
      throw new Error(`Unknown hallway "${hallwayId}".`);
    }
    if (!hallway.elevators.length) {
      throw new Error(`Hallway "${hallwayId}" does not define elevators.`);
    }
    const elevator = hallway.elevators.reduce((best, current) => {
      if (!best) {
        return current;
      }
      const bestDelta = Math.abs((best.currentFloor ?? 0) - targetFloor);
      const currentDelta = Math.abs((current.currentFloor ?? 0) - targetFloor);
      if (currentDelta < bestDelta) {
        return current;
      }
      return best;
    }, null);

    const eta = Math.abs((elevator.currentFloor ?? 0) - targetFloor) * (hallway.travelTimePerFloor ?? 1.2);
    elevator.currentFloor = targetFloor;
    const result = { hallwayId, elevator, targetFloor, eta };
    this._dispatch("hallway:elevator-routed", result);
    return result;
  }

  loadMinimalGeometry(hallwayId) {
    const hallway = this._hallways.get(hallwayId);
    if (!hallway) {
      throw new Error(`Unknown hallway "${hallwayId}".`);
    }
    const streamed = this._geometryStreamer({ hallwayId, sections: hallway.sections });
    this._streamedSections.set(hallwayId, streamed);
    this._dispatch("hallway:geometry-streamed", { hallwayId, sections: streamed });
    return streamed;
  }

  unloadGeometry(hallwayId) {
    if (!this._streamedSections.has(hallwayId)) {
      return false;
    }
    const sections = this._streamedSections.get(hallwayId);
    this._streamedSections.delete(hallwayId);
    this._dispatch("hallway:geometry-unloaded", { hallwayId, sections });
    return true;
  }

  enterFromLobby(lobbyDescriptor, doorId) {
    const doorInfo = this.findDoor(doorId);
    if (!doorInfo) {
      throw new Error(`Unable to locate hallway door "${doorId}".`);
    }
    const { hallwayId, door, hallway } = doorInfo;
    this._activeHallwayId = hallwayId;
    this._activeDoorId = doorId;
    this._connectedLobbyId = lobbyDescriptor?.id ?? null;
    if (!this._streamedSections.has(hallwayId)) {
      this.loadMinimalGeometry(hallwayId);
    }
    this._dispatch("hallway:entered", {
      hallwayId,
      door,
      lobby: lobbyDescriptor ?? null,
      sections: this._streamedSections.get(hallwayId) ?? [],
    });
    return door;
  }

  exitToLobby() {
    if (!this._activeHallwayId) {
      return null;
    }
    const hallwayId = this._activeHallwayId;
    const doorId = this._activeDoorId;
    const lobbyId = this._connectedLobbyId;
    this._dispatch("hallway:exiting", { hallwayId, doorId, lobbyId });
    this.unloadGeometry(hallwayId);
    this._activeHallwayId = null;
    this._activeDoorId = null;
    this._connectedLobbyId = null;
    this._dispatch("hallway:exited", { hallwayId, doorId, lobbyId });
    return hallwayId;
  }

  on(type, handler) {
    this._eventTarget.addEventListener(type, handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this._eventTarget.removeEventListener(type, handler);
  }

  _dispatch(type, detail) {
    const event = new CustomEventCtor(type, { detail });
    if (typeof this._eventTarget.dispatchEvent === "function") {
      this._eventTarget.dispatchEvent(event);
    } else if (typeof this._eventTarget.emit === "function") {
      this._eventTarget.emit(type, event);
    }
  }
}

export default HallwayManager;

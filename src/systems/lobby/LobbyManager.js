/**
 * LobbyManager coordinates lobby lifecycle events including door interactions,
 * state transitions, and building lobby scenes from procedural descriptors.
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
        // Surface listener errors without interrupting other listeners.
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

function defaultSceneFactory(descriptor) {
  const {
    id,
    name = `Lobby ${id}`,
    geometry = { type: "box", size: [20, 10, 20] },
    materials = ["polished-concrete", "glass"],
    lighting = { intensity: 0.8, color: "#ffe5cc" },
    procedural = {},
  } = descriptor;

  return {
    id,
    name,
    geometry,
    materials,
    lighting,
    metadata: {
      source: "procedural",
      seed: procedural.seed ?? null,
      features: Array.isArray(procedural.features)
        ? [...procedural.features]
        : [],
    },
  };
}

export class LobbyManager {
  constructor(options = {}) {
    const { sceneFactory = defaultSceneFactory, eventTarget } = options;
    this._sceneFactory = sceneFactory;
    this._eventTarget = createEventTarget(eventTarget);

    this._descriptors = new Map();
    this._loadedScenes = new Map();
    this._doorStates = new Map();
    this._state = "exterior";
    this._currentLobbyId = null;
    this._activeDoorId = null;
  }

  registerDescriptor(lobbyId, descriptor) {
    if (!lobbyId) {
      throw new Error("Lobby id is required to register a descriptor.");
    }
    const normalized = {
      ...descriptor,
      id: lobbyId,
      doors: Array.isArray(descriptor?.doors) ? [...descriptor.doors] : [],
    };
    this._descriptors.set(lobbyId, normalized);
    this._dispatch("lobby:descriptor-registered", {
      lobbyId,
      descriptor: normalized,
    });
  }

  unregisterDescriptor(lobbyId) {
    if (this._descriptors.delete(lobbyId)) {
      this._dispatch("lobby:descriptor-unregistered", { lobbyId });
    }
  }

  getCurrentState() {
    return this._state;
  }

  getCurrentLobbyId() {
    return this._currentLobbyId;
  }

  getActiveDoorId() {
    return this._activeDoorId;
  }

  getActiveLobbyDescriptor() {
    if (!this._currentLobbyId) {
      return null;
    }
    return this._descriptors.get(this._currentLobbyId) ?? null;
  }

  getDoor(lobbyId, doorId) {
    const descriptor = this._descriptors.get(lobbyId);
    if (!descriptor) {
      return null;
    }
    return descriptor.doors.find((door) => door.id === doorId) ?? null;
  }

  listDoors(lobbyId) {
    const descriptor = this._descriptors.get(lobbyId);
    if (!descriptor) {
      return [];
    }
    return [...descriptor.doors];
  }

  loadLobbyScene(lobbyId) {
    if (this._loadedScenes.has(lobbyId)) {
      return this._loadedScenes.get(lobbyId);
    }
    const descriptor = this._descriptors.get(lobbyId);
    if (!descriptor) {
      throw new Error(`No lobby descriptor registered for id "${lobbyId}".`);
    }
    const scene = this._sceneFactory(descriptor);
    this._loadedScenes.set(lobbyId, scene);
    this._dispatch("lobby:loaded", { lobbyId, scene });
    return scene;
  }

  unloadLobbyScene(lobbyId) {
    if (!this._loadedScenes.has(lobbyId)) {
      return false;
    }
    const scene = this._loadedScenes.get(lobbyId);
    this._loadedScenes.delete(lobbyId);
    this._dispatch("lobby:unloaded", { lobbyId, scene });
    return true;
  }

  setDoorState(lobbyId, doorId, state) {
    const key = `${lobbyId}:${doorId}`;
    this._doorStates.set(key, state);
    this._dispatch("lobby:door-state", { lobbyId, doorId, state });
  }

  getDoorState(lobbyId, doorId) {
    const key = `${lobbyId}:${doorId}`;
    return this._doorStates.get(key) ?? "closed";
  }

  handleDoorInteraction({ lobbyId, doorId, action }) {
    if (!lobbyId || !doorId || !action) {
      throw new Error("lobbyId, doorId, and action are required for door interaction.");
    }
    const descriptor = this._descriptors.get(lobbyId);
    if (!descriptor) {
      throw new Error(`Unknown lobby "${lobbyId}".`);
    }
    const door = this.getDoor(lobbyId, doorId);
    if (!door) {
      throw new Error(`Unknown door "${doorId}" for lobby "${lobbyId}".`);
    }

    switch (action) {
      case "open":
        this.setDoorState(lobbyId, doorId, "open");
        this._dispatch("lobby:door-opened", { lobbyId, doorId, door });
        break;
      case "close":
        this.setDoorState(lobbyId, doorId, "closed");
        this._dispatch("lobby:door-closed", { lobbyId, doorId, door });
        break;
      case "enter":
        this.setDoorState(lobbyId, doorId, "open");
        this.enterLobby(lobbyId, doorId);
        break;
      case "exit":
        if (this._state === "hallway") {
          this.returnToLobby(doorId);
        }
        this.exitLobby(lobbyId, doorId);
        this.setDoorState(lobbyId, doorId, "closed");
        break;
      default:
        throw new Error(`Unsupported door action "${action}".`);
    }
  }

  enterLobby(lobbyId, doorId) {
    const scene = this.loadLobbyScene(lobbyId);
    this._state = "lobby";
    this._currentLobbyId = lobbyId;
    this._activeDoorId = doorId;
    this._dispatch("lobby:entered", {
      lobbyId,
      doorId,
      scene,
    });
    return scene;
  }

  exitLobby(lobbyId = this._currentLobbyId, doorId = this._activeDoorId) {
    if (!lobbyId || this._state === "exterior") {
      return false;
    }
    this._dispatch("lobby:exiting", { lobbyId, doorId });
    this.unloadLobbyScene(lobbyId);
    this._state = "exterior";
    this._currentLobbyId = null;
    this._activeDoorId = null;
    this._dispatch("lobby:exited", { lobbyId, doorId });
    return true;
  }

  enterHallway(doorId) {
    if (this._state !== "lobby") {
      throw new Error("Cannot enter a hallway when not inside a lobby.");
    }
    this._state = "hallway";
    this._activeDoorId = doorId;
    this._dispatch("lobby:to-hallway", {
      lobbyId: this._currentLobbyId,
      doorId,
    });
  }

  returnToLobby(doorId = this._activeDoorId) {
    if (this._state !== "hallway") {
      return false;
    }
    this._state = "lobby";
    this._dispatch("lobby:from-hallway", {
      lobbyId: this._currentLobbyId,
      doorId,
    });
    return true;
  }

  destroy() {
    this._descriptors.clear();
    this._loadedScenes.clear();
    this._doorStates.clear();
    this._state = "exterior";
    this._currentLobbyId = null;
    this._activeDoorId = null;
    this._dispatch("lobby:destroyed", {});
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

export default LobbyManager;

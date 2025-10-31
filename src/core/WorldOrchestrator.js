const LIFECYCLE_HOOKS = ["enter", "exit", "update"];

export class WorldOrchestrator {
  constructor() {
    this.systems = new Map();
    this.sceneStack = [];
    this.hooks = new Map(
      LIFECYCLE_HOOKS.map((hook) => [hook, new Set()])
    );
    this.systemBindings = new Map();
  }

  registerSystem(name, system) {
    if (!name || typeof name !== "string") {
      throw new TypeError("System name must be a non-empty string.");
    }

    if (this.systems.has(name)) {
      throw new Error(`System '${name}' is already registered.`);
    }

    const systemObj = system ?? {};
    this.systems.set(name, systemObj);

    const boundHooks = [];
    for (const hook of LIFECYCLE_HOOKS) {
      if (typeof systemObj[hook] === "function") {
        const bound = (context) => systemObj[hook].call(systemObj, context);
        this.hooks.get(hook).add(bound);
        boundHooks.push({ hook, handler: bound });
      }
    }

    this.systemBindings.set(name, boundHooks);

    return () => {
      this.unregisterSystem(name);
    };
  }

  unregisterSystem(name) {
    if (!this.systems.has(name)) {
      return false;
    }

    this.systems.delete(name);

    const bindings = this.systemBindings.get(name) ?? [];
    for (const { hook, handler } of bindings) {
      this.hooks.get(hook).delete(handler);
    }

    this.systemBindings.delete(name);
    return true;
  }

  on(hook, handler) {
    if (!LIFECYCLE_HOOKS.includes(hook)) {
      throw new Error(`Unknown lifecycle hook '${hook}'.`);
    }

    if (typeof handler !== "function") {
      throw new TypeError("Lifecycle handler must be a function.");
    }

    const handlers = this.hooks.get(hook);
    handlers.add(handler);

    return () => handlers.delete(handler);
  }

  off(hook, handler) {
    if (!LIFECYCLE_HOOKS.includes(hook)) {
      return false;
    }

    const handlers = this.hooks.get(hook);
    return handlers.delete(handler);
  }

  pushScene(scene) {
    if (typeof scene !== "object" || scene === null) {
      throw new TypeError("Scene must be a non-null object.");
    }

    const previousScene = this.getCurrentScene();
    this.sceneStack.push(scene);
    const context = this._buildContext(scene, { previousScene });

    if (typeof scene.enter === "function") {
      scene.enter(context);
    }

    this._invokeHook("enter", context);
    return scene;
  }

  popScene() {
    if (this.sceneStack.length === 0) {
      return null;
    }

    const scene = this.sceneStack.pop();
    const nextScene = this.getCurrentScene();
    const context = this._buildContext(scene, { nextScene });

    if (typeof scene.exit === "function") {
      scene.exit(context);
    }

    this._invokeHook("exit", context);
    return scene;
  }

  clearScenes() {
    while (this.sceneStack.length > 0) {
      this.popScene();
    }
  }

  update(delta = 0, timestamp) {
    const scene = this.getCurrentScene();

    const resolvedTimestamp =
      typeof timestamp === "number"
        ? timestamp
        : typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const context = this._buildContext(scene, {
      delta,
      timestamp: resolvedTimestamp,
    });

    if (scene && typeof scene.update === "function") {
      scene.update(context);
    }

    this._invokeHook("update", context);
  }

  getCurrentScene() {
    return this.sceneStack[this.sceneStack.length - 1] ?? null;
  }

  getSceneStack() {
    return this.sceneStack.slice();
  }

  getSystem(name) {
    return this.systems.get(name);
  }

  hasSystem(name) {
    return this.systems.has(name);
  }

  _buildContext(scene, extras = {}) {
    return {
      scene,
      orchestrator: this,
      systems: this.systems,
      ...extras,
    };
  }

  _invokeHook(hook, context) {
    const handlers = this.hooks.get(hook);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      handler(context);
    }
  }
}

export default WorldOrchestrator;

import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import WorldOrchestrator from "./core/WorldOrchestrator.js";

export { WorldOrchestrator };

export function createRenderer({
  canvas,
  alpha = false,
  antialias = true,
  clearColor = 0x000000,
  parent,
  pixelRatio,
} = {}) {
  const resolvedPixelRatio =
    typeof pixelRatio === "number"
      ? pixelRatio
      : typeof window !== "undefined" && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha, antialias });
  renderer.setPixelRatio(resolvedPixelRatio);

  const targetParent = parent ?? document.body;
  if (!canvas && targetParent) {
    targetParent.appendChild(renderer.domElement);
  }

  const container = canvas ?? renderer.domElement.parentElement ?? targetParent;
  const { width, height } = _getViewportSize(container);
  renderer.setSize(width, height);

  if (!alpha) {
    renderer.setClearColor(clearColor, 1);
  }

  return renderer;
}

export function createCameraRig({
  fov = 60,
  aspect,
  near = 0.1,
  far = 1000,
  position = new THREE.Vector3(0, 2, 5),
  lookAt = new THREE.Vector3(0, 0, 0),
} = {}) {
  const resolvedAspect = aspect ?? _getDefaultAspect();
  const camera = new THREE.PerspectiveCamera(fov, resolvedAspect, near, far);
  camera.position.copy(position);
  camera.lookAt(lookAt);

  const rig = new THREE.Group();
  rig.name = "CameraRig";
  rig.add(camera);

  return { camera, rig };
}

export function createOrchestrator() {
  return new WorldOrchestrator();
}

export function bootstrapWorld({
  renderer: providedRenderer,
  cameraRig: providedCameraRig,
  scene: providedScene,
  orchestrator: providedOrchestrator,
  parent,
  autoStart = true,
} = {}) {
  const renderer =
    providedRenderer ?? createRenderer({ parent: parent ?? document.body });
  const { camera, rig: cameraRig } =
    providedCameraRig ?? createCameraRig();
  const scene = providedScene ?? new THREE.Scene();
  if (!scene.children.includes(cameraRig)) {
    scene.add(cameraRig);
  }

  const orchestrator = providedOrchestrator ?? createOrchestrator();

  const resize = () => {
    const container = renderer.domElement.parentElement ?? renderer.domElement;
    const { width, height } = _getViewportSize(container);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  window.addEventListener("resize", resize);
  resize();

  let frameHandle = null;
  let lastTimestamp = null;

  const loop = (time) => {
    if (lastTimestamp === null) {
      lastTimestamp = time;
    }

    const delta = (time - lastTimestamp) / 1000;
    lastTimestamp = time;

    orchestrator.update(delta, time);

    const activeScene = orchestrator.getCurrentScene();
    const renderScene =
      activeScene && activeScene.scene instanceof THREE.Scene
        ? activeScene.scene
        : scene;

    renderer.render(renderScene, camera);
    frameHandle = window.requestAnimationFrame(loop);
  };

  const start = () => {
    if (frameHandle !== null) {
      return;
    }
    lastTimestamp = null;
    frameHandle = window.requestAnimationFrame(loop);
  };

  const stop = () => {
    if (frameHandle === null) {
      return;
    }
    window.cancelAnimationFrame(frameHandle);
    frameHandle = null;
  };

  const dispose = () => {
    stop();
    window.removeEventListener("resize", resize);
    renderer.dispose();
  };

  if (autoStart) {
    start();
  }

  return {
    renderer,
    camera,
    cameraRig,
    scene,
    orchestrator,
    start,
    stop,
    dispose,
  };
}

function _getViewportSize(element) {
  if (element instanceof HTMLCanvasElement) {
    return {
      width: element.clientWidth || window.innerWidth,
      height: element.clientHeight || window.innerHeight,
    };
  }

  if (element && element !== document.body) {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width || window.innerWidth,
      height: rect.height || window.innerHeight,
    };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

function _getDefaultAspect() {
  const size = _getViewportSize(document.body);
  return size.width / size.height;
}

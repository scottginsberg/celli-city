import * as THREE from 'three';
import MagnifyingGlass from '../systems/tools/MagnifyingGlass.js';

const canvas = document.querySelector('#city-canvas');
const infoPanel = document.querySelector('#info');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.autoClear = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d16);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const directional = new THREE.DirectionalLight(0xffffff, 0.6);
directional.position.set(10, 20, 10);
scene.add(directional);

const mainCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
mainCamera.position.set(40, 40, 40);
mainCamera.lookAt(0, 0, 0);

const cityGroup = buildMicroCity();
scene.add(cityGroup);

const citizens = [];
cityGroup.traverse((child) => {
  if (child.userData.isCitizen) {
    citizens.push(child);
  }
});

const magnifyingGlass = new MagnifyingGlass({
  renderer,
  scene,
  target: cityGroup,
  overlaySize: 280,
  overlayMargin: 32,
  minZoom: 0.6,
  maxZoom: 6,
  selectable: citizens,
  onCitizenSelected: handleCitizenSelection,
});

magnifyingGlass.activate();

const clock = new THREE.Clock();

const pointerHandlers = {
  pointerdown: (event) => magnifyingGlass.handlePointerDown(event),
  pointermove: (event) => magnifyingGlass.handlePointerMove(event),
  pointerup: (event) => magnifyingGlass.handlePointerUp(event),
  pointercancel: (event) => magnifyingGlass.handlePointerUp(event),
  wheel: (event) => magnifyingGlass.handleWheel(event),
};

for (const [type, handler] of Object.entries(pointerHandlers)) {
  renderer.domElement.addEventListener(type, handler, { passive: type === 'wheel' ? false : true });
}

window.addEventListener('keydown', (event) => {
  if (!magnifyingGlass.handleKeyDown(event)) {
    if (event.key === 'ArrowUp') {
      mainCamera.position.y += 2;
    } else if (event.key === 'ArrowDown') {
      mainCamera.position.y -= 2;
    }
  }
});

window.addEventListener('resize', onWindowResize);
onWindowResize();

let highlightedCitizen = null;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  updateCitizens(delta);

  renderer.render(scene, mainCamera);

  magnifyingGlass.updateTargetBounds();
  magnifyingGlass.update(delta);
  magnifyingGlass.render();
}

animate();

function handleCitizenSelection(mesh) {
  if (highlightedCitizen && highlightedCitizen !== mesh) {
    highlightedCitizen.material.emissive.setScalar(0);
  }

  highlightedCitizen = mesh;

  const material = highlightedCitizen.material;
  if (material && material.emissive) {
    material.emissive.setRGB(0.9, 0.4, 0.1);
  }

  infoPanel.textContent = `Citizen ${mesh.userData.id} selected at (${mesh.position.x.toFixed(1)}, ${mesh.position.z.toFixed(1)})`;
}

function buildMicroCity() {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x1a1f2f })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const blockMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6fbf, roughness: 0.6, metalness: 0.1 });
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x2e4474, roughness: 0.4, metalness: 0.2 });

  const random = createSeededRandom(1337);

  const blockSize = 6;
  for (let x = -3; x <= 3; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      const height = 2 + random() * 12;
      const geometry = new THREE.BoxGeometry(blockSize, height, blockSize);
      const material = (x + z) % 2 === 0 ? blockMaterial : towerMaterial;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x * 9, height / 2, z * 9);
      group.add(mesh);
    }
  }

  const citizenMaterial = new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0x000000 });
  const citizenGeometry = new THREE.SphereGeometry(0.7, 16, 16);

  let citizenId = 1;
  for (let i = 0; i < 18; i += 1) {
    const citizen = new THREE.Mesh(citizenGeometry, citizenMaterial.clone());
    citizen.position.set(
      (random() - 0.5) * 60,
      0.7,
      (random() - 0.5) * 60,
    );
    citizen.userData.isCitizen = true;
    citizen.userData.id = citizenId++;
    citizen.userData.velocity = new THREE.Vector2((random() - 0.5) * 6, (random() - 0.5) * 6);
    group.add(citizen);
  }

  const lights = new THREE.PointLight(0xff8844, 0.7, 60);
  lights.position.set(-20, 20, 20);
  group.add(lights);

  return group;
}

function updateCitizens(delta) {
  const bounds = 35;
  cityGroup.traverse((child) => {
    if (child.userData && child.userData.velocity) {
      const velocity = child.userData.velocity;
      child.position.x += velocity.x * delta;
      child.position.z += velocity.y * delta;

      if (child.position.x < -bounds || child.position.x > bounds) {
        velocity.x *= -1;
        child.position.x = THREE.MathUtils.clamp(child.position.x, -bounds, bounds);
      }
      if (child.position.z < -bounds || child.position.z > bounds) {
        velocity.y *= -1;
        child.position.z = THREE.MathUtils.clamp(child.position.z, -bounds, bounds);
      }
    }
  });
}

function onWindowResize() {
  const { clientWidth, clientHeight } = canvas;

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(clientWidth, clientHeight, false);

  mainCamera.aspect = clientWidth / clientHeight;
  mainCamera.updateProjectionMatrix();

  magnifyingGlass.resize();
}

function createSeededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function random() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

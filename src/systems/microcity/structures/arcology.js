function requireThree(visualContext) {
  const { THREE } = visualContext || {};
  if (!THREE) {
    throw new Error('Arcology generator requires a THREE instance in visualContext');
  }
  return THREE;
}

function createLayer({ THREE, radius, height, color, emissive }) {
  const geometry = new THREE.CylinderGeometry(radius * 0.95, radius, height, 32, 1, true);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.6,
    roughness: 0.2,
    emissive: emissive ?? 0x000000,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function generateArcology({ rng, visualContext }) {
  const THREE = requireThree(visualContext);
  const group = new THREE.Group();
  group.name = 'Arcology';

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(80, 120, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 }),
  );
  base.receiveShadow = true;
  base.position.y = 6;
  group.add(base);

  const layers = 6;
  let currentHeight = 12;
  let currentRadius = 80;
  for (let i = 0; i < layers; i += 1) {
    const layerHeight = 20 + rng() * 12;
    const layerRadius = currentRadius * (0.75 + rng() * 0.1);
    const color = 0xaedff7 + Math.floor(rng() * 0x002222);
    const layer = createLayer({
      THREE,
      radius: layerRadius,
      height: layerHeight,
      color,
      emissive: 0x225577,
    });
    layer.position.y = currentHeight + layerHeight / 2;
    group.add(layer);

    const garden = new THREE.Mesh(
      new THREE.CylinderGeometry(layerRadius * 0.85, layerRadius * 0.85, 2, 32),
      new THREE.MeshStandardMaterial({ color: 0x3c9d5d, roughness: 1 }),
    );
    garden.position.y = layer.position.y + layerHeight / 2 + 1;
    garden.receiveShadow = true;
    group.add(garden);

    currentHeight += layerHeight + 3;
    currentRadius = layerRadius;
  }

  const crownHeight = 60;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(currentRadius * 0.7, crownHeight, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x66ccff, emissiveIntensity: 0.8 }),
  );
  crown.position.y = currentHeight + crownHeight / 2;
  crown.castShadow = true;
  group.add(crown);

  const beacon = new THREE.PointLight(0x99ddff, 2.5, 600, 1.5);
  beacon.position.y = crown.position.y + crownHeight / 2;
  group.add(beacon);

  return group;
}

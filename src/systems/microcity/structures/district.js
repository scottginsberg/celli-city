function requireThree(visualContext) {
  const { THREE } = visualContext || {};
  if (!THREE) {
    throw new Error('District generator requires a THREE instance in visualContext');
  }
  return THREE;
}

function jitter(rng, magnitude) {
  return (rng() - 0.5) * 2 * magnitude;
}

function createTower({ THREE, rng, radius, height, color }) {
  const geometry = new THREE.CylinderGeometry(radius * 0.8, radius, height, 12);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.4,
    roughness: 0.3,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
  });
  const tower = new THREE.Mesh(geometry, material);
  tower.castShadow = true;
  tower.receiveShadow = true;
  tower.position.y = height / 2;

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.9, radius * 0.2, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.4 }),
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = height;
  tower.add(crown);
  return tower;
}

export function generateDistrict({ rng, visualContext }) {
  const THREE = requireThree(visualContext);
  const group = new THREE.Group();
  group.name = 'District';

  const palette = [0x4b6cb7, 0x182848, 0x2c4875, 0x00bcd4];
  const towerCount = 5 + Math.floor(rng() * 4);
  const radius = 160;

  for (let i = 0; i < towerCount; i += 1) {
    const angle = (i / towerCount) * Math.PI * 2 + jitter(rng, 0.3);
    const distance = radius * (0.4 + rng() * 0.3);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const height = 40 + rng() * 60;
    const tower = createTower({
      THREE,
      rng,
      radius: 6 + rng() * 4,
      height,
      color: palette[Math.floor(rng() * palette.length)],
    });
    tower.position.x = x;
    tower.position.z = z;
    group.add(tower);
  }

  const centralSpireHeight = 100 + rng() * 50;
  const centralSpire = createTower({
    THREE,
    rng,
    radius: 12,
    height: centralSpireHeight,
    color: 0xfff176,
  });
  centralSpire.position.set(0, 0, 0);
  group.add(centralSpire);

  const transitRingGeometry = new THREE.TorusGeometry(radius * 0.5, 1.2, 16, 80);
  const transitRingMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x77ddee, emissiveIntensity: 0.6 });
  const transitRing = new THREE.Mesh(transitRingGeometry, transitRingMaterial);
  transitRing.rotation.x = Math.PI / 2;
  transitRing.position.y = 12;
  transitRing.castShadow = true;
  group.add(transitRing);

  return group;
}

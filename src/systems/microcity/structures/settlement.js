function requireThree(visualContext) {
  const { THREE } = visualContext || {};
  if (!THREE) {
    throw new Error('Settlement generator requires a THREE instance in visualContext');
  }
  return THREE;
}

function jitter(rng, magnitude) {
  return (rng() - 0.5) * 2 * magnitude;
}

export function generateSettlement({ rng, visualContext }) {
  const THREE = requireThree(visualContext);
  const group = new THREE.Group();
  group.name = 'Settlement';

  const basePalette = [0xdadada, 0xc7c7c7, 0xf2efe9];
  const accentPalette = [0x3a6ea5, 0x2f4858, 0xa23b72];

  const footprint = 80;
  const blockCount = 6 + Math.floor(rng() * 4);

  for (let i = 0; i < blockCount; i += 1) {
    const width = 6 + rng() * 4;
    const depth = 6 + rng() * 4;
    const height = 4 + rng() * 6;

    const material = new THREE.MeshStandardMaterial({
      color: basePalette[Math.floor(rng() * basePalette.length)],
      metalness: 0.1,
      roughness: 0.7,
    });

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );
    building.castShadow = true;
    building.receiveShadow = true;
    building.position.set(jitter(rng, footprint * 0.5), height / 2, jitter(rng, footprint * 0.5));
    building.rotation.y = (rng() - 0.5) * 0.3;
    group.add(building);

    const accentHeight = 1 + rng() * 2;
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, accentHeight, depth * 0.8),
      new THREE.MeshStandardMaterial({
        color: accentPalette[Math.floor(rng() * accentPalette.length)],
        metalness: 0.3,
        roughness: 0.5,
        emissiveIntensity: 0.2,
      }),
    );
    accent.position.copy(building.position);
    accent.position.y += height / 2 + accentHeight / 2;
    accent.castShadow = true;
    group.add(accent);
  }

  const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.9 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.5, 32), plazaMaterial);
  plaza.position.y = 0.25;
  plaza.receiveShadow = true;
  group.add(plaza);

  const statueMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 0.3 });
  const statue = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 6), statueMaterial);
  statue.position.y = 3.25;
  group.add(statue);

  return group;
}

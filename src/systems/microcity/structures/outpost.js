function requireThree(visualContext) {
  const { THREE } = visualContext || {};
  if (!THREE) {
    throw new Error('Outpost generator requires a THREE instance in visualContext');
  }
  return THREE;
}

function jitter(rng, magnitude) {
  return (rng() - 0.5) * 2 * magnitude;
}

export function generateOutpost({ rng, visualContext }) {
  const THREE = requireThree(visualContext);
  const group = new THREE.Group();
  group.name = 'Outpost';

  const hutGeometry = new THREE.BoxGeometry(4, 3, 4);
  const hutMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x8d7652 }),
    new THREE.MeshStandardMaterial({ color: 0x9f8f65 }),
    new THREE.MeshStandardMaterial({ color: 0x7b6747 }),
  ];

  const roofGeometry = new THREE.ConeGeometry(3, 2.5, 4);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xb7423c });

  const hutCount = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < hutCount; i += 1) {
    const hut = new THREE.Mesh(hutGeometry, hutMaterials[i % hutMaterials.length]);
    hut.position.set(jitter(rng, 12), 1.5, jitter(rng, 12));
    hut.castShadow = true;
    hut.receiveShadow = true;
    hut.scale.setScalar(0.8 + rng() * 0.4);
    group.add(hut);

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.copy(hut.position);
    roof.position.y += 2.25 * hut.scale.y;
    roof.rotation.y = rng() * Math.PI * 2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }

  const fireGeometry = new THREE.CylinderGeometry(0.3, 0.6, 0.4, 8);
  const fireMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff5500 });
  const fire = new THREE.Mesh(fireGeometry, fireMaterial);
  fire.position.set(0, 0.2, 0);
  fire.castShadow = true;
  group.add(fire);

  return group;
}

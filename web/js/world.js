import * as THREE from 'three';
import { makeMesh, texture, manifest } from './assets.js';
export async function buildSky(scene) {
  // Skybox: 6 faces, unit cube centred on camera (follows camera).
  const sky = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const m = await makeMesh('skybox01_' + i, { side: THREE.DoubleSide });
    m.material = new THREE.MeshBasicMaterial({ map: m.material.map, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false });
    m.material.map.wrapS = m.material.map.wrapT = THREE.ClampToEdgeWrapping;
    m.renderOrder = -1; m.frustumCulled = false; sky.add(m);
  }
  sky.scale.setScalar(1000); scene.add(sky);
  return sky;
}

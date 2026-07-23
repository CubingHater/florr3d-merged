import * as THREE from 'three';
import { stripNonAscii } from '../../shared/config.js';

export function damp(k, dt) { return 1 - Math.exp(-k * dt); }

export function restrictToAscii(input, maxLen) {
  if (maxLen) input.maxLength = maxLen;
  input.addEventListener('input', () => {
    const filtered = stripNonAscii(input.value);
    if (filtered !== input.value) input.value = filtered;
  });
}

export function toonMat(color) {
  return new THREE.MeshToonMaterial({ color });
}

// Convert every lit PBR material (MeshStandardMaterial, MeshPhysicalMaterial,
// MeshPhongMaterial, MeshLambertMaterial) under `root` into a MeshToonMaterial,
// carrying over color/map/transparency so imported GLB models (mob + petal
// models) match the flat-shaded look the rest of the game already uses via
// toonMat(). Materials that are already MeshToonMaterial or intentionally
// unlit (MeshBasicMaterial outlines, glow rings, shadow blobs, baked tile
// overlays) are left untouched.
const LIT_MATERIAL_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshPhongMaterial', 'MeshLambertMaterial']);
export function toonifyMaterials(root) {
  const converted = new Map(); // old material -> new material, so shared materials stay shared
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((m) => {
      if (!LIT_MATERIAL_TYPES.has(m.type)) return m;
      let toon = converted.get(m);
      if (!toon) {
        toon = new THREE.MeshToonMaterial({
          color: m.color ? m.color.clone() : undefined,
          map: m.map ?? null,
          // Some mob GLBs paint their texture entirely through the emissive
          // channel (baseColor left black, emissiveFactor [1,1,1] +
          // emissiveTexture) so the art reads at full brightness regardless
          // of scene lighting. Carrying these over keeps that texture
          // visible after the swap to MeshToonMaterial — without them the
          // mesh has a black base color and no map, so it renders solid
          // black.
          emissive: m.emissive ? m.emissive.clone() : undefined,
          emissiveMap: m.emissiveMap ?? null,
          emissiveIntensity: m.emissiveIntensity,
          transparent: m.transparent,
          opacity: m.opacity,
          alphaTest: m.alphaTest,
          side: m.side,
          skinning: m.skinning,
          morphTargets: m.morphTargets,
          vertexColors: m.vertexColors,
        });
        toon.name = m.name;
        converted.set(m, toon);
      }
      return toon;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  });
  return root;
}

export function addOutline(mesh, thickness = 0.12, color = null) {
  const c = color
    ? new THREE.Color(color)
    : mesh.material.color.clone().multiplyScalar(0.62);
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide })
  );
  outline.scale.setScalar(1 + thickness);
  outline.userData.isOutline = true;
  mesh.add(outline);
  return outline;
}

export function enableShadows(root, { cast = true, receive = false } = {}) {
  root.traverse((obj) => {
    if (!obj.isMesh || obj.userData.isOutline) return;
    if (cast) obj.castShadow = true;
    if (receive) obj.receiveShadow = true;
  });
}

export function makeRockGeometry(radius, jitter = 0.16) {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 1 + (Math.random() * 2 - 1) * jitter);
    v.multiplyScalar(seen.get(key));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function flashMaterials(root, duration = 0.12) {
  root.userData.flashUntil = performance.now() + duration * 1000;
  root.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.emissive !== undefined) {
      if (obj.material.userData.baseEmissive === undefined) {
        obj.material.userData.baseEmissive = obj.material.emissive.getHex();
      }
      obj.material.emissive.setScalar(0.55);
    }
  });
}

export function updateFlash(root) {
  if (!root.userData.flashUntil) return;
  if (performance.now() > root.userData.flashUntil) {
    root.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.emissive !== undefined) {
        obj.material.emissive.setHex(obj.material.userData.baseEmissive ?? 0);
      }
    });
    delete root.userData.flashUntil;
  }
}

export function disposeMaterials(root) {
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.dispose();
    }
  });
}

export function disposeObject3D(root) {
  disposeMaterials(root);
  const seenGeo = new Set();
  root.traverse((obj) => {
    if (obj.geometry && !seenGeo.has(obj.geometry)) {
      seenGeo.add(obj.geometry);
      obj.geometry.dispose();
    }
  });
}

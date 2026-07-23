import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { enableShadows, toonifyMaterials } from './utils.js';
import airModelUrl from '../assets/air.glb?url';
import irisModelUrl from '../assets/iris.glb?url';
import pincerModelUrl from '../assets/pincer.glb?url';
import privetModelUrl from '../assets/privet.glb?url';
import bloodsacrificeModelUrl from '../assets/bloodsacrifice.glb?url';
import jobapplicationModelUrl from '../assets/jobapplication.glb?url';
import burModelUrl from '../assets/bur.glb?url';
import beetleeggModelUrl from '../assets/beetleegg.glb?url';
import cactusPetalModelUrl from '../assets/cactusPetal.glb?url';
import crownModelUrl from '../assets/beetleegg.glb?url';
import rootModelUrl from '../assets/root.glb?url';
import dahliaModelUrl from '../assets/dahlia.glb?url';
import yinyangModelUrl from '../assets/yinyang.glb?url';

const MODELS = {
  air: { url: airModelUrl },
  iris: { url: irisModelUrl },
  pincer: { url: pincerModelUrl },
  privet: { url: privetModelUrl },
  bloodsacrifice: { url: bloodsacrificeModelUrl },
  jobapplication: { url: jobapplicationModelUrl },
  bur: { url: burModelUrl },
  beetleegg: { url: beetleeggModelUrl },
  cactusPetal: { url: cactusPetalModelUrl },
  crown: { url: crownModelUrl },
  root: { url: rootModelUrl },
  dahlia: { url: dahliaModelUrl },
  yinyang: { url: yinyangModelUrl },
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function hasPetalModel(type) { return type in MODELS; }

function loadModel(type) {
  let promise = cache.get(type);
  if (!promise) {
    promise = loader.loadAsync(MODELS[type].url).then((gltf) => {
      const template = gltf.scene;
      template.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(template);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      template.position.sub(center);
      template.position.y += size.y / 2;
      enableShadows(template, { cast: true, receive: false });
      toonifyMaterials(template);
      return { template, footprint: Math.max(size.x, size.z, size.y) };
    });
    cache.set(type, promise);
  }
  return promise;
}

export function preloadPetalModels(types) {
  for (const type of types) if (hasPetalModel(type)) loadModel(type);
}

export function swapInPetalModel(group, type, radius) {
  loadModel(type).then(({ template, footprint }) => {
    if (group.userData.modelSwapped) return;
    group.userData.modelSwapped = true;
    const inst = template.clone();
    inst.traverse((object) => { if (object.isMesh) object.material = object.material.clone(); });
    inst.scale.setScalar((radius * 2) / footprint);
    group.add(inst);
  }).catch((error) => console.warn(`petal model ${type} failed to load`, error));
}

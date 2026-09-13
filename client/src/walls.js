import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_HALF, TILE_SIZE, WALL_HEIGHT, MAP_WALLS, 
  SUBDIV, SUB_STEP, EPS,
  terrainMap, 
  buildMapAtTile, isWallCell, tileTypeAt, 
  terrainMapAt} from '../../shared/config.js';
import { tileTexture } from './tiles.js';
import dirtTileUrl from '../assets/dirttile.svg';
import desertTileUrl from '../assets/deserttile.svg';
import jungleTileUrl from '../assets/jungletile.svg';
import grassTileUrl from '../assets/grasstile.svg';

const TOP_COLOR = new THREE.Color('#4e7d20');
const CAP_OFFSET = 0.10; // vertical offset above terrain for cap base
const CAP_THICKNESS = 0.60; // adjustable thickness of caps

function capMaterial(textureUrl) {
  return new THREE.MeshBasicMaterial({
    map: tileTexture(textureUrl),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

const terrainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: tileTexture(dirtTileUrl) }, // at some point change desert walls
    uScale: { value: 0.1 },
  },
  vertexShader: `
    varying vec3 vPosition;
    varying vec3 vNormal;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vPosition = worldPos.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture;
    uniform float uScale;
    varying vec3 vPosition;
    varying vec3 vNormal;

    vec4 triplanar(sampler2D tex, vec3 p, vec3 n) {
      vec3 blend = abs(n);
      blend = normalize(max(blend, 0.001));
      //blend = pow(blend, vec3(1.5));
      blend /= blend.x + blend.y + blend.z;

      vec2 xUV = p.yz * uScale * vec2(-1.0, 1.0);
      vec2 yUV = p.xz * uScale;
      vec2 zUV = p.xy * uScale;

      vec4 xTex = texture2D(tex, xUV);
      vec4 yTex = texture2D(tex, yUV);
      vec4 zTex = texture2D(tex, zUV);

      return xTex * blend.x + yTex * blend.y + zTex * blend.z;
    }

    void main() {
      vec4 tex = triplanar(uTexture, vPosition, vNormal);
      //vec3 xTangent = dFdx( vPosition ); // (https://gamedev.stackexchange.com/questions/154854/how-do-i-implement-flat-shading-in-glsl)
      //vec3 yTangent = dFdy( vPosition );
      //vec3 faceNormal = normalize( cross( xTangent, yTangent ) );
      float col = 0.8;//0.5 + 0.5 * max(0.0, dot(vec3(0.0, 1.0, 0.0), faceNormal));
      gl_FragColor = vec4((tex * col).xyz, 1.0);
    }
  `,
});
const capMaterials = {
  grass: capMaterial(grassTileUrl),
  desert: capMaterial(desertTileUrl),
  jungle: capMaterial(jungleTileUrl),
  dirt: capMaterial(dirtTileUrl),
};

const capGeo = new THREE.BoxGeometry(SUB_STEP, CAP_THICKNESS, SUB_STEP);

function tileMesh(wallMap, gx, gz) {
  const x0 = (gx - 0.5) * TILE_SIZE;
  const z0 = (gz - 0.5) * TILE_SIZE;
  const positions = [];
  const indices = [];

  const caps = [];

  for (let iz = 0; iz <= SUBDIV; iz++) {
    for (let ix = 0; ix <= SUBDIV; ix++) {
      const me = terrainMapAt(gx, gz, ix, iz);
      positions.push(me.x, me.height, me.z);
    }
  }

  for (let iz = 0; iz < SUBDIV; iz++) {
    for (let ix = 0; ix < SUBDIV; ix++) {
      const a = iz * (SUBDIV + 1) + ix;
      const b = a + 1;
      const c = a + SUBDIV + 1;
      const d = c + 1;
      //tObj.a = 
      let me = terrainMapAt(gx, gz, ix, iz);
      if (me.flip) {
        indices.push(a, c, d, a, d, b);
      } else {
        indices.push(a, c, b, b, c, d);
      }
      
      if (me.capped) {
        const x1 = x0 + ix * SUB_STEP;
        const z1 = z0 + iz * SUB_STEP;
        caps.push({
          x: gx + 0.25 * ix,
          z: gz + 0.25 * iz,
          pos: new THREE.Vector3(x1 + SUB_STEP / 2, me.a.y + CAP_THICKNESS / 2 + CAP_OFFSET, z1 + SUB_STEP / 2),
        });
      }
    }
  }

  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  terrain.setIndex(indices);
  terrain.computeVertexNormals();
  return { terrain, caps };
}

function biomeOf(w) {
  for (let ring = 1; ring <= 12; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const gx = w.gx + dx, gz = w.gz + dz;
        if (isWallCell(gx, gz)) continue;
        return tileTypeAt(gx * TILE_SIZE, gz * TILE_SIZE);
      }
    }
  }
  return 'grass';
}

export const CHUNK_SIZE = 5;

const terrainMesh = {};
const capMesh = {};

export function makeWalls(scene) {
  if (!MAP_WALLS.length) return;

  const wallMap = new Map(MAP_WALLS.map((w) => [`${w.gx},${w.gz}`, w]));
  //const terrainGeometries = {};
  const terrainChunks = {};
  const capGeometries = new Map();
  const capChunks = {};

  for (const w of MAP_WALLS) {
    const { terrain, caps } = tileMesh(wallMap, w.gx, w.gz);
    let cx = Math.floor(w.gx / CHUNK_SIZE), cz = Math.floor(w.gz / CHUNK_SIZE);
    if (!terrainChunks[`${cx},${cz}`]) terrainChunks[`${cx},${cz}`] = {};
    let dx = (w.gx + CHUNK_SIZE * 50) % CHUNK_SIZE, dz = (w.gz + CHUNK_SIZE * 50) % CHUNK_SIZE;
    terrainChunks[`${cx},${cz}`][`${dx},${dz}`] = terrain;

    const biome = biomeOf(w);
    const key = ['grass', 'desert', 'jungle', 'dirt'].includes(biome) ? biome : 'grass';
    if (!capGeometries.has(key)) capGeometries.set(key, []);
    capGeometries.get(key).push(...caps);
  }

  for (const [biome, caps] of capGeometries) {
    if (!caps.length) continue;
    const material = capMaterials[biome] || new THREE.MeshBasicMaterial({ color: TOP_COLOR, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    caps.forEach((c) => {
      let cx = Math.floor(c.x / CHUNK_SIZE), cz = Math.floor(c.z / CHUNK_SIZE);
      if (!capChunks[`${cx},${cz},${biome}`]) capChunks[`${cx},${cz},${biome}`] = {mat: material, positions: []};
      capChunks[`${cx},${cz},${biome}`].positions.push(c.pos);
    })
    //scene.add(new THREE.Mesh(mergeGeometries(caps), material));
  }

  if (terrainChunks !== {}) {
    for (const c in terrainChunks) {
      const [cx, cz] = c.split(',').map(Number);
      let chunkGeos = [];
      for (const d in terrainChunks[c]) chunkGeos.push(terrainChunks[c][d]);
      if (chunkGeos.length) {
        const mesh = new THREE.Mesh(mergeGeometries(chunkGeos), terrainMaterial);
        terrainMesh[`${cx * CHUNK_SIZE * TILE_SIZE},${cz * CHUNK_SIZE * TILE_SIZE}`] = mesh;
        scene.add(mesh);
      }
    }
  }

  if (capChunks !== {}) {
    for (const c in capChunks) {
      const pos = c.split(',');
      pos.pop();
      const [cx, cz] = pos.map(Number);
      const caps = capChunks[c];
      const mesh = new THREE.InstancedMesh(capGeo, caps.mat, caps.positions.length);
      caps.positions.forEach((c, i) => {
        mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(c));
      })
      capMesh[`${cx * CHUNK_SIZE * TILE_SIZE},${cz * CHUNK_SIZE * TILE_SIZE}`] = mesh;
      scene.add(mesh);
    }
  }
}

function cullMeshChunks(cameraPos, meshToCull, maxDist) {
  for (const c in meshToCull) {
    const [px, pz] = c.split(',').map(Number);
    const mesh = meshToCull[c];
    const dist = new THREE.Vector3(px, 0, pz).sub(cameraPos).lengthSq();
    mesh.visible = dist < maxDist * maxDist;
  }
}

export function cullTerrainChunks(cameraPos, meshToCull, maxDist = 230) {
  cullMeshChunks(cameraPos, terrainMesh, maxDist);
  cullMeshChunks(cameraPos, capMesh, maxDist);
}


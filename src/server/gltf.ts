// glTF pipeline: build GLBs from three.js geometry, inspect them, make decimated/compressed web previews,
// and export OBJ/STL. Pure Node — used by the seed script and the upload-processing job.
import { Document, NodeIO, type Primitive, type Node as GNode, type Accessor } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

let ioPromise: Promise<NodeIO> | null = null;
export function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
    return new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  })();
  return ioPromise;
}

export interface PartMaterial {
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
}

export interface ModelPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: PartMaterial;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Index of the parent part (for hierarchical animation). */
  parent?: number;
  /** Simple looping rotation animation around an axis (radians per second). */
  spin?: { axis: 'x' | 'y' | 'z'; speed: number };
}

export interface ModelSpec {
  name: string;
  parts: ModelPart[];
  /** Adds a 4-bone skeleton bending the first part (a vertical mesh), plus a sway animation. */
  rig?: { height: number; bones: number };
}

function hexToLinear(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  c.convertSRGBToLinear();
  return [c.r, c.g, c.b];
}

function accessor(doc: Document, type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR' | 'MAT4', array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>, buffer = doc.getRoot().listBuffers()[0]!) {
  return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
}

export async function buildGlb(spec: ModelSpec): Promise<Uint8Array> {
  const doc = new Document();
  doc.createBuffer('main');
  const scene = doc.createScene(spec.name);
  const root = doc.createNode(spec.name);
  scene.addChild(root);
  const nodes: GNode[] = [];
  const materialCache = new Map<string, ReturnType<Document['createMaterial']>>();

  spec.parts.forEach((part, idx) => {
    const g = part.geometry.index ? part.geometry : part.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const prim = doc.createPrimitive();
    prim.setAttribute('POSITION', accessor(doc, 'VEC3', new Float32Array(g.attributes.position!.array)));
    prim.setAttribute('NORMAL', accessor(doc, 'VEC3', new Float32Array(g.attributes.normal!.array)));
    if (g.attributes.uv) prim.setAttribute('TEXCOORD_0', accessor(doc, 'VEC2', new Float32Array(g.attributes.uv.array)));
    if (g.index) prim.setIndices(accessor(doc, 'SCALAR', new Uint32Array(g.index.array)));

    if (spec.rig && idx === 0) {
      const count = g.attributes.position!.count;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      const seg = spec.rig.height / (spec.rig.bones - 1);
      for (let i = 0; i < count; i++) {
        const y = Math.min(Math.max(g.attributes.position!.getY(i), 0), spec.rig.height);
        const f = y / seg;
        const j = Math.min(Math.floor(f), spec.rig.bones - 2);
        const t = f - j;
        joints[i * 4] = j;
        joints[i * 4 + 1] = j + 1;
        weights[i * 4] = 1 - t;
        weights[i * 4 + 1] = t;
      }
      prim.setAttribute('JOINTS_0', accessor(doc, 'VEC4', joints));
      prim.setAttribute('WEIGHTS_0', accessor(doc, 'VEC4', weights));
    }

    const key = JSON.stringify(part.material);
    let mat = materialCache.get(key);
    if (!mat) {
      mat = doc
        .createMaterial(part.name)
        .setBaseColorFactor([...hexToLinear(part.material.color), 1])
        .setMetallicFactor(part.material.metalness ?? 0)
        .setRoughnessFactor(part.material.roughness ?? 0.6);
      if (part.material.emissive) mat.setEmissiveFactor(hexToLinear(part.material.emissive));
      materialCache.set(key, mat);
    }
    prim.setMaterial(mat);
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    const node = doc.createNode(part.name).setMesh(mesh);
    if (part.position) node.setTranslation(part.position);
    if (part.rotation) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation));
      node.setRotation([q.x, q.y, q.z, q.w]);
    }
    if (part.scale) node.setScale(part.scale);
    nodes.push(node);
    const parent = part.parent !== undefined ? nodes[part.parent]! : root;
    parent.addChild(node);
  });

  // Spin animations
  const spinning = spec.parts.map((p, i) => [p, nodes[i]!] as const).filter(([p]) => p.spin);
  if (spinning.length) {
    const anim = doc.createAnimation('Spin');
    for (const [p, node] of spinning) {
      const steps = 16;
      const duration = (Math.PI * 2) / Math.abs(p.spin!.speed);
      const times = new Float32Array(steps + 1);
      const rots = new Float32Array((steps + 1) * 4);
      const base = new THREE.Quaternion(...(node.getRotation() as [number, number, number, number]));
      const axis = new THREE.Vector3(p.spin!.axis === 'x' ? 1 : 0, p.spin!.axis === 'y' ? 1 : 0, p.spin!.axis === 'z' ? 1 : 0);
      for (let s = 0; s <= steps; s++) {
        times[s] = (duration * s) / steps;
        const q = base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, (Math.sign(p.spin!.speed) * Math.PI * 2 * s) / steps));
        rots.set([q.x, q.y, q.z, q.w], s * 4);
      }
      const sampler = doc.createAnimationSampler().setInput(accessor(doc, 'SCALAR', times)).setOutput(accessor(doc, 'VEC4', rots)).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(sampler));
    }
  }

  // Skeleton + sway animation
  if (spec.rig) {
    const { height, bones } = spec.rig;
    const seg = height / (bones - 1);
    const skin = doc.createSkin('Rig');
    const ibm = new Float32Array(16 * bones);
    let parent: GNode = root;
    const joints: GNode[] = [];
    for (let b = 0; b < bones; b++) {
      const j = doc.createNode(`Bone_${b}`).setTranslation([0, b === 0 ? 0 : seg, 0]);
      parent.addChild(j);
      parent = j;
      joints.push(j);
      skin.addJoint(j);
      const m = new THREE.Matrix4().makeTranslation(0, -seg * b, 0);
      ibm.set(m.elements, b * 16);
    }
    skin.setInverseBindMatrices(accessor(doc, 'MAT4', ibm)).setSkeleton(joints[0]!);
    nodes[0]!.setSkin(skin);
    const anim = doc.createAnimation('Sway');
    const steps = 24;
    const duration = 3;
    joints.slice(1).forEach((j, bi) => {
      const times = new Float32Array(steps + 1);
      const rots = new Float32Array((steps + 1) * 4);
      for (let s = 0; s <= steps; s++) {
        times[s] = (duration * s) / steps;
        const angle = Math.sin((s / steps) * Math.PI * 2 + bi * 0.6) * 0.28;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle * 0.4, 0, angle));
        rots.set([q.x, q.y, q.z, q.w], s * 4);
      }
      const sampler = doc.createAnimationSampler().setInput(accessor(doc, 'SCALAR', times)).setOutput(accessor(doc, 'VEC4', rots)).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(j).setTargetPath('rotation').setSampler(sampler));
    });
  }

  doc.getRoot().getAsset().generator = 'Stuffin3D procedural generator (CC0)';
  const io = await getIO();
  return io.writeBinary(doc);
}

export interface GlbStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  animations: number;
  skins: number;
  bbox: { min: number[]; max: number[] };
  extensions: string[];
}

export async function inspectGlb(buf: Uint8Array): Promise<GlbStats> {
  const io = await getIO();
  const doc = await io.readBinary(buf);
  const r = doc.getRoot();
  let triangles = 0;
  let vertices = 0;
  for (const mesh of r.listMeshes())
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      vertices += pos?.getCount() ?? 0;
      const idx = p.getIndices();
      triangles += Math.floor((idx ? idx.getCount() : pos?.getCount() ?? 0) / 3);
    }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of r.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix() as number[]);
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      if (!pos) continue;
      const lo = new THREE.Vector3(...(pos.getMin([]) as [number, number, number])).applyMatrix4(m);
      const hi = new THREE.Vector3(...(pos.getMax([]) as [number, number, number])).applyMatrix4(m);
      for (const v of [lo, hi]) {
        min[0] = Math.min(min[0]!, v.x); min[1] = Math.min(min[1]!, v.y); min[2] = Math.min(min[2]!, v.z);
        max[0] = Math.max(max[0]!, v.x); max[1] = Math.max(max[1]!, v.y); max[2] = Math.max(max[2]!, v.z);
      }
    }
  }
  return {
    triangles,
    vertices,
    meshes: r.listMeshes().length,
    materials: r.listMaterials().length,
    animations: r.listAnimations().length,
    skins: r.listSkins().length,
    bbox: { min: min.map((n) => +n.toFixed(3)), max: max.map((n) => +n.toFixed(3)) },
    extensions: r.listExtensionsUsed().map((e) => e.extensionName),
  };
}

/**
 * Public web preview: welded, decimated (meshoptimizer), quantized and meshopt-compressed.
 * The full-quality source never leaves private storage.
 */
export async function makePreviewGlb(source: Uint8Array, ratio = 0.35): Promise<Uint8Array> {
  const io = await getIO();
  const doc = await io.readBinary(source);
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: true }),
    prune(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  doc.getRoot().getAsset().extras = { stuffin3d: 'preview — reduced quality, not licensed for use' };
  return io.writeBinary(doc);
}

interface WorldTriangleSource {
  positions: number[][];
  normals: number[][];
  uvs: number[][] | null;
  indices: number[];
  name: string;
}

async function collectGeometry(source: Uint8Array): Promise<WorldTriangleSource[]> {
  const io = await getIO();
  const doc = await io.readBinary(source);
  const out: WorldTriangleSource[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix() as number[]);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION') as Accessor;
      const nor = p.getAttribute('NORMAL');
      const uv = p.getAttribute('TEXCOORD_0');
      const count = pos.getCount();
      const positions: number[][] = [];
      const normals: number[][] = [];
      const uvs: number[][] | null = uv ? [] : null;
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3(...(pos.getElement(i, []) as unknown as [number, number, number])).applyMatrix4(m);
        positions.push([v.x, v.y, v.z]);
        const n = nor ? new THREE.Vector3(...(nor.getElement(i, []) as unknown as [number, number, number])).applyMatrix3(nm).normalize() : new THREE.Vector3(0, 1, 0);
        normals.push([n.x, n.y, n.z]);
        if (uv && uvs) uvs.push(uv.getElement(i, []) as number[]);
      }
      const idx = p.getIndices();
      const indices = idx ? Array.from(idx.getArray()!) : [...Array(count).keys()];
      out.push({ positions, normals, uvs, indices, name: mesh.getName() || 'mesh' });
    }
  }
  return out;
}

export async function glbToObj(source: Uint8Array, name: string): Promise<string> {
  const parts = await collectGeometry(source);
  const lines = [`# ${name} — exported by Stuffin3D`, `# Units: meters, Y-up`];
  let offset = 1;
  for (const p of parts) {
    lines.push(`o ${p.name.replace(/\s+/g, '_')}`);
    for (const v of p.positions) lines.push(`v ${v.map((n) => n.toFixed(5)).join(' ')}`);
    for (const n of p.normals) lines.push(`vn ${n.map((x) => x.toFixed(4)).join(' ')}`);
    if (p.uvs) for (const t of p.uvs) lines.push(`vt ${t[0]!.toFixed(5)} ${(1 - t[1]!).toFixed(5)}`);
    for (let i = 0; i < p.indices.length; i += 3) {
      const f = [p.indices[i]!, p.indices[i + 1]!, p.indices[i + 2]!].map((k) => k + offset);
      lines.push(`f ${f.map((k) => (p.uvs ? `${k}/${k}/${k}` : `${k}//${k}`)).join(' ')}`);
    }
    offset += p.positions.length;
  }
  return lines.join('\n') + '\n';
}

export async function glbToStl(source: Uint8Array): Promise<Buffer> {
  const parts = await collectGeometry(source);
  const tris = parts.reduce((a, p) => a + p.indices.length / 3, 0);
  const buf = Buffer.alloc(84 + tris * 50);
  buf.write('Stuffin3D binary STL', 0, 'ascii');
  buf.writeUInt32LE(tris, 80);
  let o = 84;
  for (const p of parts) {
    for (let i = 0; i < p.indices.length; i += 3) {
      const [a, b, c] = [p.positions[p.indices[i]!]!, p.positions[p.indices[i + 1]!]!, p.positions[p.indices[i + 2]!]!];
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...(b as [number, number, number])).sub(new THREE.Vector3(...(a as [number, number, number]))), new THREE.Vector3(...(c as [number, number, number])).sub(new THREE.Vector3(...(a as [number, number, number])))).normalize();
      // STL is conventionally Z-up
      for (const v of [[n.x, -n.z, n.y], [a[0], -a[2], a[1]], [b[0], -b[2], b[1]], [c[0], -c[2], c[1]]]) {
        for (const x of v) {
          buf.writeFloatLE(x ?? 0, o);
          o += 4;
        }
      }
      buf.writeUInt16LE(0, o);
      o += 2;
    }
  }
  return buf;
}

export type { Primitive };

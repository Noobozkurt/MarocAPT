'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type ViewMode = 'lit' | 'clay' | 'wireframe' | 'albedo' | 'normal' | 'roughness' | 'metallic';
export type EnvPreset = 'studio' | 'sunset' | 'night';

export interface SceneProps {
  url: string;
  mode: ViewMode;
  env: EnvPreset;
  autoRotate: boolean;
  playing: string | null;
  onAnimations?: (names: string[]) => void;
  onStats?: (s: { triangles: number; meshes: number }) => void;
  controlsRef?: React.MutableRefObject<OrbitControlsImpl | null>;
  resetKey?: number;
  background?: boolean;
}

const ENV_BG: Record<EnvPreset, string> = { studio: '#16161f', sunset: '#2a1712', night: '#060814' };

function Lights({ env }: { env: EnvPreset }) {
  return (
    <Environment resolution={256} background={false}>
      {env === 'studio' && (
        <>
          <Lightformer form="rect" intensity={3} position={[0, 5, -5]} scale={[10, 5, 1]} />
          <Lightformer form="rect" intensity={1.5} position={[-5, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={1.5} position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="ring" intensity={2} position={[0, 3, 5]} scale={2} />
        </>
      )}
      {env === 'sunset' && (
        <>
          <Lightformer form="rect" intensity={4} color="#ff9a5a" position={[-6, 1.5, -2]} rotation-y={Math.PI / 3} scale={[8, 2, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#7aa2ff" position={[5, 4, 3]} scale={[6, 4, 1]} />
        </>
      )}
      {env === 'night' && (
        <>
          <Lightformer form="rect" intensity={1.2} color="#5b7cff" position={[0, 5, -4]} scale={[8, 4, 1]} />
          <Lightformer form="circle" intensity={3} color="#c9b8ff" position={[3, 2, 4]} scale={1} />
        </>
      )}
    </Environment>
  );
}

const grey = (v: number) => new THREE.Color(v, v, v);

function Model({ url, mode, playing, onAnimations, onStats, resetKey }: Pick<SceneProps, 'url' | 'mode' | 'playing' | 'onAnimations' | 'onStats' | 'resetKey'>) {
  const gltf = useGLTF(url, false, true); // meshopt-compressed previews (EXT_meshopt_compression)
  const group = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, group);
  const { camera, controls } = useThree();

  const { center, radius } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: sphere.radius || 1 };
  }, [gltf.scene]);

  useEffect(() => {
    onAnimations?.(names);
    let tris = 0;
    let meshes = 0;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    });
    onStats?.({ triangles: Math.round(tris), meshes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf]);

  useEffect(() => {
    const dist = radius / Math.sin(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360) * 1.1;
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.35, center.z + dist * 0.75);
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    const c = controls as unknown as OrbitControlsImpl | null;
    if (c) {
      c.target.copy(center);
      c.minDistance = radius * 0.6;
      c.maxDistance = radius * 6;
      c.update();
    }
  }, [center, radius, camera, controls, resetKey]);

  // Material modes: keep the originals, swap in diagnostic materials.
  useEffect(() => {
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = (mesh.userData.__orig ??= mesh.material) as THREE.MeshStandardMaterial;
      const skinning = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
      let next: THREE.Material = original;
      switch (mode) {
        case 'clay':
          next = new THREE.MeshStandardMaterial({ color: '#bdbdc7', roughness: 0.85, metalness: 0 });
          break;
        case 'wireframe':
          next = new THREE.MeshBasicMaterial({ color: '#8b70ff', wireframe: true });
          break;
        case 'albedo':
          next = new THREE.MeshBasicMaterial({ color: original.color ?? '#ffffff', map: original.map ?? null });
          break;
        case 'normal':
          next = new THREE.MeshNormalMaterial();
          break;
        case 'roughness':
          next = new THREE.MeshBasicMaterial({ color: grey(original.roughness ?? 1), map: original.roughnessMap ?? null });
          break;
        case 'metallic':
          next = new THREE.MeshBasicMaterial({ color: grey(original.metalness ?? 0), map: original.metalnessMap ?? null });
          break;
      }
      if (skinning) (next as THREE.Material & { skinning?: boolean }).skinning = true;
      if (mesh.material !== original && mesh.material !== next) (mesh.material as THREE.Material).dispose?.();
      mesh.material = next;
      mesh.castShadow = true;
    });
  }, [gltf.scene, mode]);

  useEffect(() => {
    Object.values(actions).forEach((a) => a?.stop());
    if (playing && actions[playing]) actions[playing]!.reset().play();
  }, [playing, actions]);

  return (
    <group ref={group}>
      <primitive object={gltf.scene} />
    </group>
  );
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 35, position: [2, 1.5, 2.5] }}
      frameloop="always"
      aria-hidden
    >
      {props.background !== false && <color attach="background" args={[ENV_BG[props.env]]} />}
      <ambientLight intensity={props.env === 'night' ? 0.15 : 0.3} />
      <directionalLight position={[3, 5, 2]} intensity={props.env === 'night' ? 0.4 : 1.1} castShadow />
      <Suspense fallback={null}>
        <Model url={props.url} mode={props.mode} playing={props.playing} onAnimations={props.onAnimations} onStats={props.onStats} resetKey={props.resetKey} />
        <Lights env={props.env} />
        <ContactShadows position={[0, -0.001, 0]} opacity={0.5} scale={6} blur={2.5} far={3} />
      </Suspense>
      <OrbitControls ref={props.controlsRef as never} makeDefault autoRotate={props.autoRotate} autoRotateSpeed={1.2} enableDamping enablePan />
    </Canvas>
  );
}

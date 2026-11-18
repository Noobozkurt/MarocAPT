'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Expand, Grid3x3, Pause, Play, RotateCcw, Smartphone, Sparkles } from 'lucide-react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { EnvPreset, ViewMode } from './scene';
import { ArViewer } from './model-viewer';
import { cn } from '@/lib/utils';

const Scene = dynamic(() => import('./scene'), { ssr: false, loading: () => <div className="skeleton absolute inset-0" /> });

const MODES: Array<[ViewMode, string]> = [
  ['lit', 'Lit'],
  ['clay', 'Clay'],
  ['wireframe', 'Wireframe'],
  ['albedo', 'Albedo'],
  ['normal', 'Normals'],
  ['roughness', 'Roughness'],
  ['metallic', 'Metallic'],
];

export function ModelViewer3D({ url, poster, title, variant = 'full', autoLoad = false }: { url: string; poster?: string | null; title: string; variant?: 'full' | 'hero'; autoLoad?: boolean }) {
  const [active, setActive] = useState(autoLoad);
  const [mode, setMode] = useState<ViewMode>('lit');
  const [env, setEnv] = useState<EnvPreset>('studio');
  const [autoRotate, setAutoRotate] = useState(true);
  const [anims, setAnims] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [stats, setStats] = useState<{ triangles: number; meshes: number } | null>(null);
  const [ar, setAr] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [reduced, setReduced] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    if (m.matches) setAutoRotate(false);
  }, []);

  // Hero: load after the page is idle so it never competes with LCP.
  useEffect(() => {
    if (variant !== 'hero' || active) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(() => setActive(true), { timeout: 3000 }) : window.setTimeout(() => setActive(true), 2000);
    return () => window.clearTimeout(id);
  }, [variant, active]);

  const onAnimations = useCallback((names: string[]) => {
    setAnims(names);
    if (names.length) setPlaying(names[0]!);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const c = controls.current;
    if (!c) return;
    const step = 0.15;
    if (e.key === 'ArrowLeft') c.setAzimuthalAngle(c.getAzimuthalAngle() - step);
    else if (e.key === 'ArrowRight') c.setAzimuthalAngle(c.getAzimuthalAngle() + step);
    else if (e.key === 'ArrowUp') c.setPolarAngle(Math.max(0.1, c.getPolarAngle() - step));
    else if (e.key === 'ArrowDown') c.setPolarAngle(Math.min(Math.PI - 0.1, c.getPolarAngle() + step));
    else if (e.key === '+' || e.key === '=') c.object.position.lerp(c.target, 0.12);
    else if (e.key === '-') c.object.position.sub(c.target).multiplyScalar(1.12).add(c.target);
    else return;
    e.preventDefault();
    setAutoRotate(false);
    c.update();
  };

  const btn = 'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition';

  return (
    <div ref={wrap} className={cn('relative overflow-hidden rounded-2xl border border-border bg-[#16161f]', variant === 'hero' ? 'aspect-square' : 'aspect-[4/3]')}>
      {!active && (
        <button onClick={() => setActive(true)} className="group absolute inset-0 h-full w-full" aria-label={`Load interactive 3D preview of ${title}`} data-testid="load-3d">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt="" className="h-full w-full object-cover" fetchPriority={variant === 'hero' ? 'high' : 'auto'} />}
          {variant === 'full' && (
            <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl bg-black/60 px-5 py-3 font-semibold text-white backdrop-blur transition group-hover:scale-105">
              <Box className="h-5 w-5" aria-hidden /> View in 3D
            </span>
          )}
        </button>
      )}
      {active && (
        <div
          className="absolute inset-0 cursor-grab focus-visible:outline-none active:cursor-grabbing"
          tabIndex={0}
          role="application"
          aria-label={`Interactive 3D preview of ${title}. Drag or use arrow keys to orbit, plus and minus to zoom.`}
          onKeyDown={onKey}
          data-testid="viewer-canvas"
        >
          <Scene url={url} mode={mode} env={env} autoRotate={autoRotate && !reduced} playing={playing} onAnimations={onAnimations} onStats={setStats} controlsRef={controls} resetKey={resetKey} />
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute bottom-3 right-4 select-none text-xs font-bold uppercase tracking-[0.3em] text-white/25">Stuffin3D preview</div>

      {active && variant === 'full' && (
        <>
          <div className="glass absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1 rounded-xl p-1" role="toolbar" aria-label="Display mode">
            {MODES.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn(btn, mode === m ? 'bg-accent text-accent-fg' : 'hover:bg-surface-2')}>
                {m === 'wireframe' && <Grid3x3 className="h-3.5 w-3.5" aria-hidden />}
                {label}
              </button>
            ))}
          </div>
          <div className="glass absolute bottom-3 left-3 flex flex-wrap items-center gap-1 rounded-xl p-1" role="toolbar" aria-label="Viewer controls">
            <label className="sr-only" htmlFor="env-select">Environment</label>
            <select id="env-select" value={env} onChange={(e) => setEnv(e.target.value as EnvPreset)} className="h-8 rounded-lg bg-transparent px-2 text-xs font-semibold">
              <option value="studio">Studio HDRI</option>
              <option value="sunset">Sunset HDRI</option>
              <option value="night">Night HDRI</option>
            </select>
            <button onClick={() => setAutoRotate((a) => !a)} aria-pressed={autoRotate} className={cn(btn, 'hover:bg-surface-2')}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Auto-rotate
            </button>
            {anims.length > 0 && (
              <>
                <button onClick={() => setPlaying((p) => (p ? null : anims[0]!))} className={cn(btn, 'hover:bg-surface-2')} aria-label={playing ? 'Pause animation' : 'Play animation'}>
                  {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />} {anims.length > 1 ? '' : anims[0]}
                </button>
                {anims.length > 1 && (
                  <select value={playing ?? ''} onChange={(e) => setPlaying(e.target.value || null)} className="h-8 rounded-lg bg-transparent px-2 text-xs" aria-label="Animation clip">
                    {anims.map((a) => <option key={a}>{a}</option>)}
                  </select>
                )}
              </>
            )}
            <button onClick={() => setResetKey((k) => k + 1)} className={cn(btn, 'hover:bg-surface-2')} aria-label="Reset camera"><RotateCcw className="h-3.5 w-3.5" aria-hidden /></button>
            <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())} className={cn(btn, 'hover:bg-surface-2')} aria-label="Toggle fullscreen"><Expand className="h-3.5 w-3.5" aria-hidden /></button>
            <button onClick={() => setAr(true)} className={cn(btn, 'bg-accent text-accent-fg')} data-testid="view-ar"><Smartphone className="h-3.5 w-3.5" aria-hidden /> View in AR</button>
          </div>
          {stats && <div className="glass absolute right-3 top-3 rounded-lg px-2 py-1 text-[11px] text-muted" aria-live="polite">Preview: {stats.triangles.toLocaleString()} tris · {stats.meshes} meshes</div>}
        </>
      )}
      {ar && <ArViewer src={url} poster={poster} title={title} onClose={() => setAr(false)} />}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createElement } from 'react';

/** Google <model-viewer> for AR: WebXR / Scene Viewer on Android, Quick Look on iOS (USDZ generated on the fly). */
export function ArViewer({ src, poster, title, onClose }: { src: string; poster?: string | null; title: string; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    import('@google/model-viewer').then(() => setReady(true));
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label={`View ${title} in AR`} className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">{title} — AR</span>
        <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm">Close</button>
      </div>
      {ready ? (
        createElement('model-viewer', {
          src,
          poster: poster ?? undefined,
          alt: `3D model of ${title}`,
          ar: true,
          'ar-modes': 'webxr scene-viewer quick-look',
          'camera-controls': true,
          'auto-rotate': true,
          'shadow-intensity': '1',
          style: { width: '100%', flex: 1, background: '#111' },
        }, createElement('button', { slot: 'ar-button', className: 'absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-white px-5 py-3 font-semibold text-black' }, 'Place in your space'))
      ) : (
        <p className="m-auto text-white/70">Loading AR viewer…</p>
      )}
      <p className="p-4 text-center text-xs text-white/60">AR needs a phone or tablet with ARCore (Android) or ARKit (iOS). On desktop you can still orbit the model.</p>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Requests a fresh single-use signed URL (ownership-checked server-side) and starts the download. */
export function DownloadButton({ licenseId, fileId, label, access, className, versionId }: { licenseId: string; fileId: string; label: string; access?: string | null; className?: string; versionId?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        data-testid={`download-${fileId}`}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const res = await fetch(`/api/licenses/${licenseId}/download`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId, access, versionId }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const a = document.createElement('a');
            a.href = data.url;
            a.download = data.fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className={cn('inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60', className)}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} {label}
      </button>
      {err && <span role="alert" className="mt-1 max-w-xs text-xs text-danger">{err}</span>}
    </span>
  );
}

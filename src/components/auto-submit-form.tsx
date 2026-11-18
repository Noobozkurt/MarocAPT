'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** GET form that navigates on change (URL-synced, shareable filters). Works as a plain form without JS. */
export function AutoSubmitForm({ children, className, hidden = {}, multi = false }: { children: ReactNode; className?: string; hidden?: Record<string, string | string[] | undefined>; multi?: boolean }) {
  const router = useRouter();
  const submit = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    const grouped = new Map<string, string[]>();
    for (const [k, v] of fd.entries()) {
      if (typeof v !== 'string' || v === '') continue;
      grouped.set(k, [...(grouped.get(k) ?? []), v]);
    }
    for (const [k, vals] of grouped) params.set(k, multi ? vals.join(',') : vals[vals.length - 1]!);
    router.push(`/catalog${params.size ? `?${params}` : ''}`, { scroll: false });
  };
  return (
    <form method="get" action="/catalog" className={className} onChange={(e) => submit(e.currentTarget)} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
      {Object.entries(hidden).map(([k, v]) => (v === undefined || v === '' ? null : <input key={k} type="hidden" name={k} value={Array.isArray(v) ? v.join(',') : v} />))}
      {children}
    </form>
  );
}

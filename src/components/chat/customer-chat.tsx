'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Star } from 'lucide-react';
import { Composer, MessageList } from './thread';
import { newClientId, useConversation } from './use-conversation';
import { Button, Input, Label, Select, Textarea } from '../ui';

const TOPICS: Array<[string, string]> = [
  ['ORDER_PAYMENT', 'Order / payment'],
  ['DOWNLOAD', 'Download issue'],
  ['LICENSE', 'License question'],
  ['TECHNICAL', 'Technical / file problem'],
  ['OTHER', 'Other'],
];

const GUEST_KEY = 's3d_chat_guest';

export interface GuestSession {
  conversationId: string;
  token: string;
}

export function loadGuest(): GuestSession | null {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
  } catch {
    return null;
  }
}

function Conversation({ id, guestToken, onBack, onUnread }: { id: string; guestToken: string | null; onBack: () => void; onUnread?: (n: number) => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const v = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, []);
  const c = useConversation(id, { guestToken, side: 'CUSTOMER', visible });
  const [rated, setRated] = useState(false);
  const lastSeen = useRef<number>(0);

  // Browser notification + sound for agent replies while the tab is hidden.
  useEffect(() => {
    const last = c.messages[c.messages.length - 1];
    if (!last || last.senderType !== 'AGENT') return;
    const t = new Date(last.createdAt).getTime();
    if (t <= lastSeen.current) return;
    const first = lastSeen.current === 0;
    lastSeen.current = t;
    if (first) return;
    if (document.visibilityState === 'hidden') {
      onUnread?.(1);
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.05;
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.15);
      } catch {
        /* audio blocked */
      }
      if ('Notification' in window && Notification.permission === 'granted') new Notification(`${last.senderName} replied`, { body: last.body.slice(0, 120), icon: '/icon.svg', tag: id });
    }
  }, [c.messages, id, onUnread]);

  const resolved = c.meta && ['RESOLVED', 'CLOSED'].includes(c.meta.status);
  const showCsat = (resolved || c.csatRequested) && !c.meta?.csatScore && !rated;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" aria-hidden /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.meta?.subject ?? 'Conversation'}</p>
          <p className="text-[11px] text-muted" aria-live="polite">
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${c.availability?.agentsOnline ? 'bg-success' : 'bg-muted'}`} aria-hidden />
            {c.agent?.name ? `${c.agent.name} · ` : ''}{c.availability?.agentsOnline ? 'Agent online' : c.availability?.expectedReply ?? '…'}
            {!c.connected && ' · reconnecting…'}
          </p>
        </div>
      </div>
      {c.loading ? <div className="flex-1 p-4"><div className="skeleton h-12" /></div> : (
        <MessageList messages={c.messages} side="CUSTOMER" otherName={c.agent?.name} hasMore={c.hasMore} onLoadOlder={c.loadOlder} onRetry={c.retry} typing={c.typing} guestToken={guestToken} />
      )}
      {c.error && <p role="alert" className="px-4 pb-1 text-xs text-danger">{c.error}</p>}
      {showCsat && (
        <div className="border-t border-border p-3" data-testid="csat">
          <p className="mb-2 text-sm font-semibold">How did we do?</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await fetch(`/api/chat/conversations/${id}/csat`, { method: 'POST', headers: { 'content-type': 'application/json', ...(guestToken ? { 'x-guest-token': guestToken } : {}) }, body: JSON.stringify({ score: Number(fd.get('score')), comment: fd.get('comment') || undefined }) });
              if (r.ok) setRated(true);
            }}
            className="space-y-2"
          >
            <div role="radiogroup" aria-label="Rating 1 to 5" className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer"><input type="radio" name="score" value={n} required className="peer sr-only" /><Star className="h-6 w-6 text-border peer-checked:fill-warning peer-checked:text-warning peer-focus-visible:outline" aria-label={`${n} stars`} /></label>
              ))}
            </div>
            <Input name="comment" placeholder="Anything we could do better? (optional)" maxLength={500} aria-label="Comment" />
            <Button size="sm" type="submit">Send rating</Button>
          </form>
        </div>
      )}
      {rated && <p className="border-t border-border p-3 text-sm text-success" role="status">Thanks for your feedback!</p>}
      <Composer conversationId={id} guestToken={guestToken} onSend={(body, o) => c.send(body, { attachments: o.attachments })} onTyping={() => c.notifyTyping()} />
      {resolved && <p className="px-4 pb-2 text-center text-[11px] text-muted">This conversation is resolved — replying reopens it.</p>}
    </div>
  );
}

interface Prefill {
  topic?: string;
  productId?: string;
  subject?: string;
}

export function CustomerChat({ prefill, initialConversationId, initialGuestToken, onUnread }: { prefill?: Prefill | null; initialConversationId?: string | null; initialGuestToken?: string | null; onUnread?: (n: number) => void }) {
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated';
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [active, setActive] = useState<string | null>(initialConversationId ?? null);
  const [list, setList] = useState<Array<{ id: string; subject: string; status: string; unread: number; preview: string; lastMessageAt: string }>>([]);
  const [mode, setMode] = useState<'home' | 'new'>(prefill ? 'new' : 'home');
  const [question, setQuestion] = useState('');
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; excerpt: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initialGuestToken && initialConversationId) {
      const g = { conversationId: initialConversationId, token: initialGuestToken };
      localStorage.setItem(GUEST_KEY, JSON.stringify(g));
      setGuest(g);
    } else setGuest(loadGuest());
  }, [initialConversationId, initialGuestToken]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const r = await fetch('/api/chat/conversations');
    if (r.ok) setList((await r.json()).conversations);
  }, [signedIn]);

  useEffect(() => {
    refresh();
    if (signedIn) fetch('/api/chat/context').then(async (r) => r.ok && setOrders((await r.json()).orders));
  }, [signedIn, refresh]);

  useEffect(() => {
    if (prefill) setMode('new');
  }, [prefill]);

  // Knowledge base suggestions as the customer types.
  useEffect(() => {
    if (question.trim().length < 4) {
      setArticles([]);
      return;
    }
    const h = setTimeout(async () => {
      const r = await fetch(`/api/chat/kb?q=${encodeURIComponent(question)}`);
      if (r.ok) setArticles((await r.json()).articles);
    }, 300);
    return () => clearTimeout(h);
  }, [question]);

  if (active) {
    const token = !signedIn && guest?.conversationId === active ? guest.token : null;
    return <Conversation id={active} guestToken={token} onBack={() => { setActive(null); refresh(); }} onUnread={onUnread} />;
  }

  const start = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const r = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: fd.get('topic'), subject: prefill?.subject, message: question, clientMessageId: newClientId(), orderId: fd.get('orderId') || null, productId: prefill?.productId ?? null, guestEmail: signedIn ? null : fd.get('email'), guestName: signedIn ? null : fd.get('name') }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.issues?.[0]?.message || d.error);
    if (d.guestToken) {
      const g = { conversationId: d.conversation.id, token: d.guestToken };
      localStorage.setItem(GUEST_KEY, JSON.stringify(g));
      setGuest(g);
    }
    setQuestion('');
    setActive(d.conversation.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      {mode === 'home' ? (
        <div className="space-y-4">
          <div>
            <p className="text-lg font-bold">Hi{session?.user?.name ? ` ${session.user.name.split(' ')[0]}` : ''} 👋</p>
            <p className="text-sm text-muted">Ask anything about orders, downloads or licenses.</p>
          </div>
          <Button className="w-full" onClick={() => setMode('new')} data-testid="chat-new">Start a new conversation</Button>
          {!signedIn && guest && <Button variant="outline" className="w-full" onClick={() => setActive(guest.conversationId)}>Continue your last conversation</Button>}
          {list.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Your conversations</p>
              <ul className="space-y-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setActive(c.id)} className="w-full rounded-xl border border-border p-3 text-left hover:bg-surface-2" data-testid="chat-history-item">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{c.subject}</span>{c.unread > 0 && <span className="rounded-full bg-accent px-2 text-[11px] text-accent-fg">{c.unread}</span>}</span>
                      <span className="block truncate text-xs text-muted">{c.status.replace('_', ' ').toLowerCase()} · {c.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-center text-xs text-muted"><Link href="/help" className="underline">Browse the help center</Link></p>
        </div>
      ) : (
        <form onSubmit={start} className="space-y-3">
          <button type="button" onClick={() => setMode('home')} className="text-xs text-muted hover:text-fg">← Back</button>
          <div>
            <Label htmlFor="chat-topic">Topic</Label>
            <Select id="chat-topic" name="topic" defaultValue={prefill?.topic ?? 'OTHER'} className="w-full">{TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </div>
          {signedIn && orders.length > 0 && (
            <div>
              <Label htmlFor="chat-order">Attach an order (optional)</Label>
              <Select id="chat-order" name="orderId" className="w-full"><option value="">No order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
            </div>
          )}
          {prefill?.productId && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">About: {prefill.subject?.replace('Problem with ', '')}</p>}
          {!signedIn && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="chat-name">Name</Label><Input id="chat-name" name="name" autoComplete="name" /></div>
              <div><Label htmlFor="chat-email">Email *</Label><Input id="chat-email" name="email" type="email" required autoComplete="email" data-testid="chat-guest-email" /></div>
            </div>
          )}
          <div>
            <Label htmlFor="chat-question">Your question</Label>
            <Textarea id="chat-question" required rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={4000} data-testid="chat-question" />
          </div>
          {articles.length > 0 && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-3" aria-live="polite">
              <p className="mb-1 text-xs font-semibold">These articles might help:</p>
              <ul className="space-y-1 text-sm">{articles.map((a) => <li key={a.slug}><Link href={`/help/${a.slug}`} target="_blank" className="text-accent underline">{a.title}</Link></li>)}</ul>
            </div>
          )}
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy} data-testid="chat-start">{busy ? 'Connecting…' : 'Talk to a human'}</Button>
          <p className="text-[11px] text-muted">If nobody is online we’ll reply by email and you can answer from your inbox.</p>
        </form>
      )}
    </div>
  );
}

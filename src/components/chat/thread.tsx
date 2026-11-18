'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, Loader2, Paperclip, RotateCw, Send, ShieldAlert, X } from 'lucide-react';
import { renderSafeMarkdown } from '@/lib/sanitize';
import { formatBytes, cn } from '@/lib/utils';
import type { ChatAttachment, ChatMessage } from './use-conversation';

export function StatusIcon({ m, readBy }: { m: ChatMessage; readBy?: string }) {
  if (m.status === 'SENDING') return <Clock className="h-3 w-3" aria-label="Sending" />;
  if (m.status === 'FAILED') return <ShieldAlert className="h-3 w-3 text-danger" aria-label="Failed" />;
  if (m.status === 'READ') return <span className="inline-flex items-center gap-0.5" aria-label={`Read${readBy ? ` by ${readBy}` : ''}`}><CheckCheck className="h-3 w-3 text-sky-400" aria-hidden />{readBy && <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-sky-500 text-[8px] font-bold text-white">{readBy[0]}</span>}</span>;
  if (m.status === 'DELIVERED') return <CheckCheck className="h-3 w-3" aria-label="Delivered" />;
  return <Check className="h-3 w-3" aria-label="Sent" />;
}

function AttachmentView({ a, guestToken }: { a: ChatAttachment; guestToken?: string | null }) {
  const href = `/api/chat/attachments/${a.id}${guestToken ? `?guestToken=${encodeURIComponent(guestToken)}` : ''}`;
  if (a.scanStatus === 'PENDING') return <span className="flex items-center gap-1 rounded-lg bg-black/10 px-2 py-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Scanning {a.fileName}…</span>;
  if (a.scanStatus === 'INFECTED') return <span className="rounded-lg bg-danger/20 px-2 py-1 text-xs text-danger">{a.fileName} was blocked by the malware scan</span>;
  if (a.mimeType.startsWith('image/'))
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={href} target="_blank" rel="noreferrer"><img src={href} alt={a.fileName} className="max-h-48 rounded-lg" /></a>;
  return <a href={href} className="rounded-lg bg-black/10 px-2 py-1 text-xs underline">{a.fileName} ({formatBytes(a.size)})</a>;
}

export function MessageList({ messages, side, otherName, hasMore, onLoadOlder, onRetry, typing, guestToken, showNotes = false }: {
  messages: ChatMessage[];
  side: 'CUSTOMER' | 'AGENT';
  otherName?: string;
  hasMore: boolean;
  onLoadOlder: () => Promise<void>;
  onRetry: (clientMessageId: string) => void;
  typing: Array<{ name: string; side: string; note?: boolean }>;
  guestToken?: string | null;
  showNotes?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const prevCount = useRef(0);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick) el.scrollTop = el.scrollHeight;
    const last = messages[messages.length - 1];
    if (messages.length > prevCount.current && last && last.senderType !== side) setAnnounce(`New message from ${last.senderName}: ${last.body.slice(0, 140)}`);
    prevCount.current = messages.length;
  }, [messages, stick, side]);

  const onScroll = async () => {
    const el = scroller.current!;
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
    if (el.scrollTop < 40 && hasMore) {
      const before = el.scrollHeight;
      await onLoadOlder();
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - before));
    }
  };

  const visibleTyping = typing.filter((t) => t.side !== side || showNotes).filter((t) => showNotes || !t.note);

  return (
    <div ref={scroller} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="message-list">
      {hasMore && <button onClick={onLoadOlder} className="mx-auto block text-xs text-accent underline">Load earlier messages</button>}
      {messages.filter((m) => showNotes || !m.isInternalNote).map((m) => {
        if (m.senderType === 'SYSTEM' || m.senderType === 'BOT')
          return <p key={m.clientMessageId ?? m.id} className="mx-auto max-w-[90%] rounded-xl bg-surface-2 px-3 py-2 text-center text-xs text-muted" data-testid="system-message">{m.body}</p>;
        const mine = m.senderType === side;
        return (
          <div key={m.clientMessageId ?? m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')} data-testid="chat-message" data-mine={mine} data-status={m.status}>
            {!mine && <span className="mb-0.5 px-1 text-[11px] text-muted">{m.senderName}</span>}
            <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.isInternalNote ? 'border border-yellow-500/50 bg-yellow-300/20 text-fg' : mine ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md bg-surface-2')}>
              {m.isInternalNote && <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-yellow-600 dark:text-yellow-300">Internal note — not visible to customer</span>}
              {m.body && <div className="chat-md break-words" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(m.body) }} />}
              {m.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.attachments.map((a) => <AttachmentView key={a.id} a={a} guestToken={guestToken} />)}</div>}
            </div>
            <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {mine && <StatusIcon m={m} readBy={m.status === 'READ' ? otherName : undefined} />}
              {m.status === 'FAILED' && m.clientMessageId && (
                <button onClick={() => onRetry(m.clientMessageId!)} className="inline-flex items-center gap-1 font-semibold text-danger underline" data-testid="retry-message">
                  <RotateCw className="h-3 w-3" aria-hidden /> Failed – tap to retry
                </button>
              )}
            </span>
          </div>
        );
      })}
      {visibleTyping.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted" data-testid="typing-indicator">
          <span className="flex gap-0.5" aria-hidden><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" /></span>
          {visibleTyping.map((t) => t.name).join(', ')} {visibleTyping.length > 1 ? 'are' : 'is'} typing{visibleTyping.some((t) => t.note) ? ' a note' : ''}…
        </p>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>
    </div>
  );
}

export interface CannedReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export function Composer({ conversationId, guestToken, onSend, onTyping, disabled, agentMode = false, canned = [], renderCanned }: {
  conversationId: string;
  guestToken?: string | null;
  onSend: (body: string, opts: { attachments: ChatAttachment[]; isInternalNote: boolean }) => void;
  onTyping: (isNote: boolean) => void;
  disabled?: boolean;
  agentMode?: boolean;
  canned?: CannedReply[];
  renderCanned?: (body: string) => Promise<string>;
}) {
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const slash = agentMode && text.startsWith('/') ? text.slice(1).toLowerCase() : null;
  const matches = slash !== null ? canned.filter((c) => c.shortcut.startsWith(slash) || c.title.toLowerCase().includes(slash)).slice(0, 6) : [];

  const upload = async (list: FileList | File[]) => {
    setErr(null);
    for (const f of Array.from(list).slice(0, 5)) {
      if (f.size > 25 * 1024 * 1024) {
        setErr(`${f.name} is larger than 25 MB`);
        continue;
      }
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.append('file', f);
      fd.append('conversationId', conversationId);
      const r = await fetch('/api/chat/attachments', { method: 'POST', body: fd, headers: guestToken ? { 'x-guest-token': guestToken } : undefined });
      const d = await r.json();
      setUploading((n) => n - 1);
      if (r.ok) setFiles((p) => [...p, d.attachment]);
      else setErr(d.error);
    }
  };

  const submit = () => {
    if ((!text.trim() && !files.length) || uploading) return;
    onSend(text, { attachments: files, isInternalNote: note });
    setText('');
    setFiles([]);
    area.current?.focus();
  };

  const pickCanned = async (c: CannedReply) => setText(renderCanned ? await renderCanned(c.body) : c.body);

  return (
    <div
      className={cn('relative border-t border-border p-3', drag && 'bg-accent/10', note && 'bg-yellow-300/10')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
    >
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Canned replies" className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {matches.map((c) => (
            <li key={c.id}><button type="button" onClick={() => pickCanned(c)} className="flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"><code className="text-accent">/{c.shortcut}</code><span className="truncate text-muted">{c.title}</span></button></li>
          ))}
        </ul>
      )}
      {agentMode && (
        <div className="mb-2 flex gap-1 text-xs" role="tablist" aria-label="Message type">
          <button role="tab" aria-selected={!note} onClick={() => setNote(false)} className={cn('rounded-lg px-2 py-1 font-semibold', !note ? 'bg-accent text-accent-fg' : 'hover:bg-surface-2')}>Reply</button>
          <button role="tab" aria-selected={note} onClick={() => setNote(true)} className={cn('rounded-lg px-2 py-1 font-semibold', note ? 'bg-yellow-400 text-black' : 'hover:bg-surface-2')} data-testid="note-toggle">Internal note</button>
          <span className="ml-auto self-center text-muted">Type / for canned replies · @name to mention</span>
        </div>
      )}
      {(files.length > 0 || uploading > 0) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs">
              {f.fileName} · {formatBytes(f.size)}
              <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.fileName}`}><X className="h-3 w-3" aria-hidden /></button>
            </span>
          ))}
          {uploading > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Uploading…</span>}
        </div>
      )}
      {err && <p role="alert" className="mb-2 text-xs text-danger">{err}</p>}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="grid h-10 w-10 flex-none place-items-center rounded-xl hover:bg-surface-2" aria-label="Attach files (images, PDF, ZIP — max 25 MB)">
          <Paperclip className="h-5 w-5" aria-hidden />
        </button>
        <input ref={fileInput} type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,application/zip,.zip,text/plain" onChange={(e) => e.target.files && upload(e.target.files)} data-testid="chat-file-input" />
        <label htmlFor={`composer-${conversationId}`} className="sr-only">{note ? 'Internal note' : 'Message'}</label>
        <textarea
          id={`composer-${conversationId}`}
          ref={area}
          value={text}
          rows={1}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            onTyping(note);
          }}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (imgs.length) {
              e.preventDefault();
              upload(imgs);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (matches[0] && slash !== null) pickCanned(matches[0]);
              else submit();
            }
          }}
          placeholder={note ? 'Write an internal note…' : 'Type your message…'}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
          data-testid="chat-input"
        />
        <button type="button" onClick={submit} disabled={disabled || uploading > 0} className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl text-accent-fg disabled:opacity-50', note ? 'bg-yellow-400 text-black' : 'bg-accent')} aria-label={note ? 'Add note' : 'Send message'} data-testid="chat-send">
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

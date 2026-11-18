'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

let shared: { socket: Socket; key: string } | null = null;

async function socketToken(): Promise<string | null> {
  const res = await fetch('/api/chat/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) return null;
  return (await res.json()).token;
}

/**
 * One authenticated Socket.IO connection per tab. Signed-in users get a short-lived token from the API
 * (refreshed on every reconnect); guests authenticate with their signed per-conversation guest token.
 */
export function useSocket(opts: { guestToken?: string | null; enabled?: boolean }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const enabled = opts.enabled !== false;
  const key = opts.guestToken ? `g:${opts.guestToken}` : 'user';

  useEffect(() => {
    if (!enabled) return;
    if (!shared || shared.key !== key) {
      shared?.socket.disconnect();
      const s = io({
        path: '/socket.io',
        autoConnect: false,
        transports: ['websocket', 'polling'],
        auth: async (cb) => cb(opts.guestToken ? { guestToken: opts.guestToken } : { token: await socketToken() }),
        reconnectionDelay: 500,
        reconnectionDelayMax: 8000,
      });
      shared = { socket: s, key };
      s.connect();
    }
    const s = shared.socket;
    setSocket(s);
    setConnected(s.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [enabled, key, opts.guestToken]);

  return { socket, connected };
}

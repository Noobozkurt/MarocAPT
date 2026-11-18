// Bridge from route handlers / jobs to the Socket.IO server running in the same process (server.ts).
import type { Server } from 'socket.io';

const g = globalThis as unknown as { __io?: Server };

export function setIO(io: Server) {
  g.__io = io;
}

export function getIO(): Server | undefined {
  return g.__io;
}

export function emitTo(room: string, event: string, payload: unknown) {
  g.__io?.to(room).emit(event, payload);
}

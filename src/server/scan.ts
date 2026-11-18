// Malware scanning for uploads. Uses a ClamAV daemon (INSTREAM) when CLAMAV_HOST is set; otherwise a
// built-in check (EICAR test signature + magic-byte/MIME consistency). Files are unavailable until CLEAN.
import net from 'node:net';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/gif': (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  'application/zip': (b) => b[0] === 0x50 && b[1] === 0x4b,
  'model/gltf-binary': (b) => b.subarray(0, 4).toString('ascii') === 'glTF',
};

export interface ScanResult {
  clean: boolean;
  engine: 'clamav' | 'builtin';
  detail?: string;
}

function clamScan(data: Buffer, host: string, port: number): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let reply = '';
    sock.setTimeout(30_000, () => sock.destroy(new Error('ClamAV timeout')));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += 64 * 1024) {
        const chunk = data.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => resolve({ clean: /OK\0?$/.test(reply.trim()), engine: 'clamav', detail: reply.trim() }));
    sock.on('error', reject);
  });
}

export async function scanBuffer(data: Buffer, mimeType: string): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (host) return clamScan(data, host, Number(process.env.CLAMAV_PORT || 3310));
  if (data.includes(Buffer.from(EICAR))) return { clean: false, engine: 'builtin', detail: 'EICAR test signature' };
  const check = MAGIC[mimeType === 'application/x-zip-compressed' ? 'application/zip' : mimeType];
  if (check && !check(data)) return { clean: false, engine: 'builtin', detail: `Content does not match declared type ${mimeType}` };
  return { clean: true, engine: 'builtin' };
}

export const CHAT_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/zip', 'application/x-zip-compressed', 'text/plain'];
export const CHAT_ATTACHMENT_MAX = 25 * 1024 * 1024;

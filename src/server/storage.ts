// Private object storage. "local" keeps files under LOCAL_STORAGE_DIR (never web-served directly);
// "s3" targets any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StorageDriver {
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  size(key: string): Promise<number>;
  /** A URL the client can fetch for a short time. Local driver returns null (we stream instead). */
  presign(key: string, fileName: string, ttlSeconds: number): Promise<string | null>;
}

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key).replace(/^\/+/, '');
  if (normalized.startsWith('..') || normalized.includes('\0')) throw new Error('Invalid storage key');
  return normalized;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private p(key: string) {
    return path.join(path.resolve(this.root), safeKey(key));
  }
  async put(key: string, data: Uint8Array) {
    const file = this.p(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }
  async get(key: string) {
    return fs.readFile(this.p(key));
  }
  async exists(key: string) {
    return fs.access(this.p(key)).then(() => true, () => false);
  }
  async delete(key: string) {
    await fs.rm(this.p(key), { force: true });
  }
  async size(key: string) {
    return (await fs.stat(this.p(key))).size;
  }
  async presign() {
    return null;
  }
}

class S3Driver implements StorageDriver {
  private clientPromise = (async () => {
    const { S3Client } = await import('@aws-sdk/client-s3');
    return new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
    });
  })();
  private bucket = process.env.S3_BUCKET || 'stuffin3d-private';
  async put(key: string, data: Uint8Array, contentType = 'application/octet-stream') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.clientPromise).send(new PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async exists(key: string) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await (await this.clientPromise).send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return true;
    } catch {
      return false;
    }
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
  async size(key: string) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const r = await (await this.clientPromise).send(new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
    return r.ContentLength ?? 0;
  }
  async presign(key: string, fileName: string, ttlSeconds: number) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return getSignedUrl(
      await this.clientPromise,
      new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key), ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"` }),
      { expiresIn: ttlSeconds },
    );
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = process.env.STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver(process.env.LOCAL_STORAGE_DIR || './storage');
  return driver;
}

export function contentTypeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return (
    {
      glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'text/plain', stl: 'model/stl', usdz: 'model/vnd.usdz+zip', fbx: 'application/octet-stream',
      zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain',
    } as Record<string, string>
  )[ext || ''] || 'application/octet-stream';
}

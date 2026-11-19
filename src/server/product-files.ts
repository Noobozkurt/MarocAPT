// Upload pipeline for product files: scan → metadata → web preview (decimated + meshopt) → mark READY.
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/lib/db';
import { inspectGlb, makePreviewGlb } from './gltf';
import { scanBuffer } from './scan';
import { contentTypeFor, storage } from './storage';

export async function processProductFile(fileId: string) {
  const file = await db.productFile.findUniqueOrThrow({ where: { id: fileId }, include: { product: true } });
  await db.productFile.update({ where: { id: fileId }, data: { status: 'PROCESSING' } });
  const data = await storage().get(file.storageKey);
  const scan = await scanBuffer(data, contentTypeFor(file.fileName));
  if (!scan.clean) {
    await db.productFile.update({ where: { id: fileId }, data: { status: 'INFECTED' } });
    await storage().delete(file.storageKey);
    return;
  }
  if (file.format === 'GLB') {
    const stats = await inspectGlb(data);
    const preview = await makePreviewGlb(data);
    const rel = `models/${file.product.slug}-${file.versionId.slice(-6)}.glb`;
    await fs.mkdir(path.join(process.cwd(), 'public/models'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), 'public', rel), preview);
    await db.product.update({
      where: { id: file.productId },
      data: {
        polycount: stats.triangles,
        vertices: stats.vertices,
        animated: stats.animations > 0 || file.product.animated,
        rigged: stats.skins > 0 || file.product.rigged,
        previewGlbPath: `/${rel}`,
        specs: { ...(file.product.specs as object), meshes: stats.meshes, materials: stats.materials, bbox: stats.bbox, units: 'meters', upAxis: 'Y' },
      },
    });
  }
  await db.productFile.update({ where: { id: fileId }, data: { status: 'READY', size: data.length } });
}

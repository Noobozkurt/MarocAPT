/* eslint-disable no-console */
// Seed: staff (with TOTP 2FA), 3 customers, 20 products built from procedurally generated CC0 models,
// prices in 4 currencies, bundles, coupons, a sale, sample orders (fulfilled through the real pipeline),
// reviews, help-center articles, canned replies and sample support conversations.
import fs from 'node:fs';
if (fs.existsSync('.env')) process.loadEnvFile('.env');

import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient, type LicenseTier, type Role } from '@prisma/client';
import { MODELS } from '../scripts/models';
import { buildGlb, glbToObj, glbToStl, inspectGlb, makePreviewGlb } from '../src/server/gltf';
import { storage } from '../src/server/storage';
import { encrypt } from '../src/lib/crypto';
import { CURRENCIES, deriveLocalPrice } from '../src/lib/money';

const db = new PrismaClient();

export const SEED_TOTP = {
  admin: 'JBSWY3DPEHPK3PXP',
  agent: 'KRSXG5CTMVRXEZLU',
  agent2: 'NBSWY3DPO5XXE3DE',
  finance: 'MFRGGZDFMZTWQ2LK',
  catalog: 'ONSWG4TFORSXEZLT',
  marketing: 'MNXW24DMMVZWK3TU',
};
export const SEED_PASSWORD = { staff: 'Stuffin3D-Admin!2026', customer: 'Customer!2026' };

const CATEGORIES = [
  { slug: 'props', name: 'Props', description: 'Furniture, containers, tools and everyday objects.' },
  { slug: 'environment', name: 'Environment & Nature', description: 'Trees, rocks, foliage and scene dressing.' },
  { slug: 'characters', name: 'Characters & Creatures', description: 'Rigged and animated characters and creatures.' },
  { slug: 'weapons', name: 'Weapons & Armor', description: 'Melee, ranged and fantasy gear.' },
  { slug: 'scifi', name: 'Sci-fi & Space', description: 'Futuristic props, vehicles and planets.' },
  { slug: 'materials', name: 'Materials & Studio', description: 'Look-dev, material previews and studio setups.' },
  { slug: 'printable', name: '3D Printing', description: 'Watertight, print-ready models.' },
];

interface Meta {
  slug: keyof typeof MODELS;
  title: string;
  category: string;
  usd: number; // personal price in USD cents
  short: string;
  tags: string[];
  software: string[];
  flags?: Partial<Record<'pbr' | 'rigged' | 'animated' | 'gameReady' | 'lowPoly' | 'printable' | 'uvUnwrapped' | 'isFree' | 'isFeatured' | 'isStaffPick', boolean>>;
  ai?: 'NONE' | 'ASSISTED' | 'GENERATED';
  res?: string;
  hue: number;
}

const ALL_DCC = ['Blender', 'Maya', '3ds Max', 'Cinema 4D', 'Unreal Engine', 'Unity', 'Godot'];
const PRODUCTS: Meta[] = [
  { slug: 'tavern-barrel', title: 'Tavern Oak Barrel', category: 'props', usd: 900, short: 'Iron-hooped oak barrel with bulged staves — a tavern essential.', tags: ['medieval', 'tavern', 'barrel', 'prop', 'fantasy', 'wood'], software: ALL_DCC, flags: { pbr: true, gameReady: true, uvUnwrapped: true, isFeatured: true }, res: '4K', hue: 28 },
  { slug: 'chess-set-classic', title: 'Classic Chess Pieces', category: 'props', usd: 1400, short: 'Turned-wood king, queen, rook and pawn in ivory and ebony finishes.', tags: ['chess', 'game', 'board', 'prop', 'lathe'], software: ALL_DCC, flags: { pbr: true, printable: true, uvUnwrapped: true, isStaffPick: true }, res: '2K', hue: 40 },
  { slug: 'potion-bottle-set', title: 'Alchemist Potion Bottles', category: 'props', usd: 700, short: 'Three glowing glass potions with cork stoppers for fantasy scenes.', tags: ['potion', 'fantasy', 'medieval', 'glass', 'alchemy', 'tavern'], software: ALL_DCC, flags: { pbr: true, gameReady: true, uvUnwrapped: true }, res: '2K', hue: 170 },
  { slug: 'lowpoly-pine-forest', title: 'Low-poly Pine Trio', category: 'environment', usd: 500, short: 'Faceted stylised pines — perfect for mobile and isometric games.', tags: ['tree', 'pine', 'forest', 'nature', 'stylized', 'mobile'], software: ALL_DCC, flags: { lowPoly: true, gameReady: true }, res: '1K', hue: 140 },
  { slug: 'scifi-cargo-crate', title: 'Sci-fi Cargo Crate', category: 'scifi', usd: 1200, short: 'Hard-surface cargo crate with hazard trim and an emissive light strip.', tags: ['sci-fi', 'scifi', 'crate', 'container', 'hard-surface', 'space'], software: ALL_DCC, flags: { pbr: true, gameReady: true, uvUnwrapped: true, isFeatured: true }, res: '4K', hue: 205 },
  { slug: 'crystal-cluster', title: 'Arcane Crystal Cluster', category: 'environment', usd: 800, short: 'Glowing amethyst crystals growing from a faceted rock base.', tags: ['crystal', 'fantasy', 'magic', 'rock', 'cave'], software: ALL_DCC, flags: { lowPoly: true, gameReady: true }, ai: 'ASSISTED', res: '2K', hue: 270 },
  { slug: 'viking-sword', title: 'Viking Longsword', category: 'weapons', usd: 1500, short: 'Beveled steel blade, gold guard and pommel, leather grip.', tags: ['sword', 'viking', 'medieval', 'weapon', 'blade'], software: ALL_DCC, flags: { pbr: true, gameReady: true, uvUnwrapped: true, isStaffPick: true }, res: '4K', hue: 215 },
  { slug: 'brass-gear-pack', title: 'Animated Brass Gears', category: 'props', usd: 600, short: 'Meshing steampunk gears with a looping rotation animation.', tags: ['gear', 'steampunk', 'mechanical', 'cog', 'industrial'], software: ALL_DCC, flags: { animated: true, pbr: true, printable: true }, res: '2K', hue: 45 },
  { slug: 'mushroom-grove', title: 'Toadstool Mushroom Grove', category: 'environment', usd: 400, short: 'A trio of storybook toadstools for forests and fairy scenes.', tags: ['mushroom', 'nature', 'forest', 'fantasy', 'stylized'], software: ALL_DCC, flags: { gameReady: true, lowPoly: true }, res: '1K', hue: 5 },
  { slug: 'desk-lamp-retro', title: 'Retro Desk Lamp', category: 'props', usd: 1000, short: 'Mid-century articulated lamp with an emissive bulb.', tags: ['lamp', 'interior', 'furniture', 'retro', 'light'], software: ALL_DCC, flags: { pbr: true, uvUnwrapped: true }, res: '4K', hue: 180 },
  { slug: 'ceramic-vase-collection', title: 'Ceramic Vase Collection', category: 'props', usd: 1100, short: 'Amphora, bottle and bowl — high-resolution lathe ceramics.', tags: ['vase', 'ceramic', 'interior', 'pottery', 'decor'], software: ALL_DCC, flags: { pbr: true, printable: true, uvUnwrapped: true, isFeatured: true }, res: '8K', hue: 18 },
  { slug: 'ringed-planet', title: 'Ringed Gas Giant', category: 'scifi', usd: 900, short: 'Gas giant with dust rings and a moon, slowly spinning.', tags: ['planet', 'space', 'sci-fi', 'moon', 'ring'], software: ALL_DCC, flags: { animated: true, pbr: true }, ai: 'GENERATED', res: '4K', hue: 30 },
  { slug: 'donut-glazed', title: 'Glazed Donut (Free)', category: 'props', usd: 0, short: 'The classic. Free asset of the month — CC0 for any project.', tags: ['donut', 'food', 'free', 'prop', 'beginner'], software: ALL_DCC, flags: { isFree: true, pbr: true, printable: true }, res: '1K', hue: 330 },
  { slug: 'trophy-cup', title: 'Champion Trophy Cup', category: 'printable', usd: 800, short: 'Gold trophy with handles and star emblem on an ebony plinth.', tags: ['trophy', 'award', 'gold', 'cup', 'prize'], software: ALL_DCC, flags: { pbr: true, printable: true }, res: '2K', hue: 48 },
  { slug: 'boulder-pack', title: 'Weathered Boulder Pack', category: 'environment', usd: 1300, short: 'Four high-detail boulders for terrain and level dressing.', tags: ['rock', 'boulder', 'stone', 'nature', 'terrain'], software: ALL_DCC, flags: { pbr: true, uvUnwrapped: true, isStaffPick: true }, res: '8K', hue: 35 },
  { slug: 'wind-turbine-animated', title: 'Animated Wind Turbine', category: 'scifi', usd: 1600, short: 'Three-blade turbine with hierarchical rotor animation.', tags: ['turbine', 'wind', 'energy', 'animated', 'industrial'], software: ALL_DCC, flags: { animated: true, gameReady: true, pbr: true }, res: '2K', hue: 195 },
  { slug: 'tentacle-rigged', title: 'Rigged Creature Tentacle', category: 'characters', usd: 1900, short: 'Five-bone skinned tentacle with a looping sway animation.', tags: ['tentacle', 'creature', 'monster', 'rigged', 'animated'], software: ALL_DCC, flags: { rigged: true, animated: true, gameReady: true, isFeatured: true }, res: '2K', hue: 265 },
  { slug: 'hdri-studio-sphere', title: 'Look-dev Material Spheres', category: 'materials', usd: 500, short: 'Chrome, plastic and rough-gold spheres for lighting checks.', tags: ['material', 'lookdev', 'studio', 'sphere', 'pbr'], software: ALL_DCC, flags: { pbr: true, uvUnwrapped: true }, res: '4K', hue: 0 },
  { slug: 'tavern-stool-table', title: 'Tavern Table, Stool & Mug', category: 'props', usd: 1400, short: 'Pedestal table, three-legged stool and a pewter mug.', tags: ['tavern', 'medieval', 'table', 'stool', 'furniture', 'mug'], software: ALL_DCC, flags: { pbr: true, gameReady: true, uvUnwrapped: true }, res: '4K', hue: 25 },
  { slug: 'torus-knot-sculpture', title: 'Torus Knot Sculpture', category: 'printable', usd: 700, short: 'A (2,3) torus knot on a pedestal — gallery piece or print test.', tags: ['sculpture', 'knot', 'abstract', 'art', 'math'], software: ALL_DCC, flags: { printable: true, animated: true, pbr: true }, res: '2K', hue: 190 },
];

const TIER_MULT: Record<LicenseTier, number> = { PERSONAL: 1, EDITORIAL: 1.5, COMMERCIAL: 2.5, EXTENDED: 6, TEAM: 2 };

function posterSvg(m: Meta, tris: number): string {
  const h = m.hue;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${esc(m.title)} preview">
<defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="hsl(${h},70%,58%)"/><stop offset=".55" stop-color="hsl(${(h + 30) % 360},55%,26%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},40%,9%)"/></radialGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>
<pattern id="w" width="220" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)"><text x="0" y="60" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#fff" fill-opacity=".07">STUFFIN3D PREVIEW</text></pattern></defs>
<rect width="800" height="800" fill="url(#g)"/>
<g transform="translate(400 370)" fill="none" stroke="url(#s)" stroke-width="3">
<polygon points="0,-170 147,-85 147,85 0,170 -147,85 -147,-85" fill="#fff" fill-opacity=".05"/>
<polyline points="-147,-85 0,0 147,-85"/><line x1="0" y1="0" x2="0" y2="170"/>
<circle r="60" stroke-opacity=".5"/></g>
<rect width="800" height="800" fill="url(#w)"/>
<text x="48" y="700" font-family="system-ui,sans-serif" font-size="44" font-weight="800" fill="#fff">${esc(m.title.replace(' (Free)', ''))}</text>
<text x="48" y="745" font-family="system-ui,sans-serif" font-size="22" fill="#fff" fill-opacity=".7">${tris.toLocaleString('en')} tris · GLB · OBJ${m.flags?.printable ? ' · STL' : ''}</text>
</svg>`;
}

async function createUser(email: string, name: string, role: Role, password: string, totp?: string) {
  return db.user.create({
    data: {
      email,
      name,
      role,
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash(password, 10),
      totpSecret: totp ? encrypt(totp) : null,
      totpEnabled: Boolean(totp),
      agentStatus: role === 'SUPPORT_AGENT' ? 'ONLINE' : 'OFFLINE',
    },
  });
}

async function main() {
  if ((await db.user.count()) > 0 && !process.argv.includes('--force')) {
    console.log('Database already seeded. Use `npm run db:reset` to start over.');
    return;
  }
  const root = process.cwd();
  fs.mkdirSync(path.join(root, 'public/models'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/posters'), { recursive: true });

  // ── Staff & customers ──
  const admin = await createUser('admin@stuffin3d.local', 'Sam Admin', 'SUPER_ADMIN', SEED_PASSWORD.staff, SEED_TOTP.admin);
  const agent = await createUser('agent@stuffin3d.local', 'Alex Support', 'SUPPORT_AGENT', SEED_PASSWORD.staff, SEED_TOTP.agent);
  await createUser('agent2@stuffin3d.local', 'Jordan Helpdesk', 'SUPPORT_AGENT', SEED_PASSWORD.staff, SEED_TOTP.agent2);
  await createUser('finance@stuffin3d.local', 'Fran Finance', 'FINANCE', SEED_PASSWORD.staff, SEED_TOTP.finance);
  await createUser('catalog@stuffin3d.local', 'Casey Catalog', 'CATALOG_MANAGER', SEED_PASSWORD.staff, SEED_TOTP.catalog);
  await createUser('marketing@stuffin3d.local', 'Morgan Marketing', 'MARKETING', SEED_PASSWORD.staff, SEED_TOTP.marketing);
  const alice = await createUser('alice@example.com', 'Alice Martin', 'CUSTOMER', SEED_PASSWORD.customer);
  const bob = await createUser('bob@example.com', 'Bob Larsson', 'CUSTOMER', SEED_PASSWORD.customer);
  const chloe = await createUser('chloe@example.com', 'Chloé Dubois', 'CUSTOMER', SEED_PASSWORD.customer);
  await db.user.update({ where: { id: chloe.id }, data: { referredById: alice.id, locale: 'fr', currency: 'EUR' } });
  await db.user.update({ where: { id: bob.id }, data: { currency: 'SEK' } });
  console.log('✓ users');

  // ── Catalog ──
  const cats = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) cats.set(c.slug, (await db.category.create({ data: { ...c, sortOrder: i } })).id);

  const productIds = new Map<string, string>();
  for (const [i, m] of PRODUCTS.entries()) {
    const glb = await buildGlb(MODELS[m.slug]());
    const stats = await inspectGlb(glb);
    const preview = await makePreviewGlb(glb);
    fs.writeFileSync(path.join(root, `public/models/${m.slug}.glb`), preview);
    fs.writeFileSync(path.join(root, `public/posters/${m.slug}.svg`), posterSvg(m, stats.triangles));
    const formats = ['GLB', 'GLTF', 'OBJ', ...(m.flags?.printable ? ['STL'] : [])];
    const created = new Date(Date.now() - (PRODUCTS.length - i) * 3 * 86400_000);
    const product = await db.product.create({
      data: {
        slug: m.slug,
        title: m.title,
        shortDescription: m.short,
        description:
          `## Overview\n${m.short}\n\nBuilt in real-world scale (meters, Y-up) with clean topology and named parts. ` +
          `Materials use the glTF metallic-roughness PBR workflow, so they import correctly into Blender, Unreal, Unity and Godot.\n\n` +
          `## What's included\n- GLB (binary glTF 2.0) — full-resolution source\n- OBJ export${m.flags?.printable ? '\n- STL (binary, Z-up) for printing' : ''}\n- LICENSE.txt\n\n` +
          `## Notes\nThis sample asset was generated procedurally for the Stuffin3D demo catalogue and is dedicated to the public domain (CC0).`,
        status: 'PUBLISHED',
        categoryId: cats.get(m.category)!,
        tags: m.tags,
        software: m.software,
        formats,
        polycount: stats.triangles,
        vertices: stats.vertices,
        textureRes: m.res,
        pbr: Boolean(m.flags?.pbr),
        rigged: stats.skins > 0,
        animated: stats.animations > 0,
        gameReady: Boolean(m.flags?.gameReady),
        lowPoly: Boolean(m.flags?.lowPoly) || stats.triangles < 3000,
        printable: Boolean(m.flags?.printable),
        uvUnwrapped: Boolean(m.flags?.uvUnwrapped),
        aiProvenance: m.ai ?? 'NONE',
        isFree: Boolean(m.flags?.isFree),
        isFeatured: Boolean(m.flags?.isFeatured),
        isStaffPick: Boolean(m.flags?.isStaffPick),
        previewGlbPath: `/models/${m.slug}.glb`,
        posterPath: `/posters/${m.slug}.svg`,
        specs: {
          meshes: stats.meshes,
          materials: stats.materials,
          bbox: stats.bbox,
          units: 'meters',
          upAxis: 'Y',
          renderer: 'Eevee / Cycles / any glTF PBR renderer',
          testedIn: ['Blender 4.4', 'Unreal Engine 5.6', 'Unity 6', 'Godot 4.5'],
          textureMaps: m.flags?.pbr ? ['Base color', 'Metallic', 'Roughness'] : ['Base color'],
          animations: stats.animations,
          bones: stats.skins ? MODELS[m.slug]().rig?.bones ?? 0 : 0,
        },
        currentVersion: m.slug === 'tavern-barrel' ? '1.1.0' : '1.0.0',
        seoTitle: `${m.title} — 3D model (GLB, OBJ${m.flags?.printable ? ', STL' : ''})`,
        seoDescription: m.short,
        createdAt: created,
      },
    });
    productIds.set(m.slug, product.id);

    for (const currency of CURRENCIES)
      for (const tier of Object.keys(TIER_MULT) as LicenseTier[]) {
        const usd = Math.round((m.usd * TIER_MULT[tier]) / 100) * 100 - (m.usd ? 1 : 0);
        await db.productPrice.create({ data: { productId: product.id, tier, currency, amount: m.usd === 0 ? 0 : currency === 'USD' ? usd : deriveLocalPrice(usd + 1, currency) } });
      }

    const versions = m.slug === 'tavern-barrel' ? [['1.0.0', 'Initial release.'], ['1.1.0', 'Fixed UV seams on the staves, added a fourth hoop, tightened scale to 1.0 m.']] : [['1.0.0', 'Initial release.']];
    for (const [vi, [version, changelog]] of versions.entries()) {
      const v = await db.productVersion.create({ data: { productId: product.id, version: version!, changelog: changelog!, createdAt: new Date(created.getTime() + vi * 86400_000 * 2) } });
      const files: Array<[string, string, Uint8Array]> = [
        ['GLB', `${m.slug}.glb`, glb],
        ['OBJ', `${m.slug}.obj`, Buffer.from(await glbToObj(glb, m.title))],
      ];
      if (m.flags?.printable) files.push(['STL', `${m.slug}.stl`, await glbToStl(glb)]);
      for (const [format, fileName, data] of files) {
        const key = `products/${product.id}/${version}/${fileName}`;
        await storage().put(key, data);
        await db.productFile.create({ data: { productId: product.id, versionId: v.id, format, fileName, storageKey: key, size: data.length, status: 'READY' } });
      }
    }
    process.stdout.write(`\r✓ product ${i + 1}/${PRODUCTS.length} ${m.slug.padEnd(30)}`);
  }
  console.log('');

  const pid = (s: string) => productIds.get(s)!;
  await db.bundle.create({ data: { slug: 'tavern-starter', title: 'Tavern Starter Kit', description: 'Everything for a cosy medieval tavern.', discountType: 'PERCENT', discountValue: 20, items: { create: ['tavern-barrel', 'tavern-stool-table', 'potion-bottle-set', 'viking-sword'].map((s) => ({ productId: pid(s) })) } } });
  await db.bundle.create({ data: { slug: 'nature-kit', title: 'Nature Kit', description: 'Trees, rocks and mushrooms for outdoor scenes.', discountType: 'PERCENT', discountValue: 15, items: { create: ['lowpoly-pine-forest', 'boulder-pack', 'mushroom-grove'].map((s) => ({ productId: pid(s) })) } } });
  const collections = [
    { slug: 'staff-picks', title: 'Staff Picks', items: PRODUCTS.filter((p) => p.flags?.isStaffPick).map((p) => p.slug) },
    { slug: 'medieval-tavern', title: 'Medieval Tavern', items: ['tavern-barrel', 'tavern-stool-table', 'potion-bottle-set', 'viking-sword', 'chess-set-classic'] },
    { slug: 'sci-fi-frontier', title: 'Sci-fi Frontier', items: ['scifi-cargo-crate', 'ringed-planet', 'wind-turbine-animated'] },
    { slug: 'print-ready', title: 'Print-ready', items: PRODUCTS.filter((p) => p.flags?.printable).map((p) => p.slug) },
  ];
  for (const c of collections) await db.collection.create({ data: { slug: c.slug, title: c.title, isFeatured: true, products: { create: c.items.map((s, i) => ({ productId: pid(s), sortOrder: i })) } } });

  await db.coupon.createMany({
    data: [
      { code: 'WELCOME10', description: '10% off your first order', type: 'PERCENT', value: 10, firstOrderOnly: true },
      { code: 'SAVE5', description: '$5 off orders over $20', type: 'FIXED', value: 500, currency: 'USD', minSubtotal: 2000 },
      { code: 'PRINT20', description: '20% off 3D-printing models', type: 'PERCENT', value: 20, categoryIds: [cats.get('printable')!] },
      { code: 'EXPIRED50', description: 'Expired test code', type: 'PERCENT', value: 50, expiresAt: new Date(Date.now() - 86400_000) },
    ],
  });
  await db.sale.create({ data: { name: 'Autumn Sale', percentOff: 15, bannerText: 'Autumn Sale — 15% off everything', startsAt: new Date(Date.now() - 86400_000), endsAt: new Date(Date.now() + 6 * 86400_000) } });
  await db.setting.create({ data: { key: 'support.hours', value: { tz: 'Europe/Stockholm', start: 9, end: 18, days: [1, 2, 3, 4, 5] } } });
  await db.setting.create({ data: { key: 'support.autoReply', value: { enabled: true, text: 'Thanks for reaching out! An agent will be with you shortly.' } } });
  await db.setting.create({ data: { key: 'store.freeAssetOfMonth', value: { productId: pid('donut-glazed') } } });
  console.log('✓ bundles, collections, coupons, sale, settings');

  // ── Orders through the real fulfilment pipeline ──
  const { fulfilOrder } = await import('../src/server/fulfillment');
  const price = async (slug: string, tier: LicenseTier, currency = 'USD') => (await db.productPrice.findUniqueOrThrow({ where: { productId_tier_currency: { productId: pid(slug), tier, currency } } })).amount;
  async function seedOrder(user: { id: string; email: string }, items: Array<[string, LicenseTier]>, currency: string, country: string, rateBps: number, daysAgo: number) {
    const lines = await Promise.all(items.map(async ([slug, tier]) => ({ slug, tier, unit: await price(slug, tier, currency) })));
    const subtotal = lines.reduce((a, l) => a + l.unit, 0);
    const tax = lines.reduce((a, l) => a + Math.round((l.unit * rateBps) / 10000), 0);
    const order = await db.order.create({
      data: {
        userId: user.id, email: user.email, currency, subtotal, taxTotal: tax, total: subtotal + tax, taxCountry: country, taxRateBps: rateBps, taxInclusive: country !== 'US',
        provider: 'TEST', providerSessionId: `cs_seed_${Math.random().toString(36).slice(2)}`, idempotencyKey: `seed_${Math.random().toString(36).slice(2)}_${Date.now()}`,
        termsAcceptedAt: new Date(), withdrawalWaiverAt: new Date(), createdAt: new Date(Date.now() - daysAgo * 86400_000),
        items: { create: await Promise.all(lines.map(async (l) => ({ productId: pid(l.slug), title: PRODUCTS.find((p) => p.slug === l.slug)!.title, tier: l.tier, unitAmount: l.unit, taxAmount: Math.round((l.unit * rateBps) / 10000), totalAmount: l.unit + Math.round((l.unit * rateBps) / 10000) }))) },
      },
    });
    await fulfilOrder(order.id, { provider: 'TEST', paymentId: `pi_seed_${order.id}`, amount: order.total });
    await db.order.update({ where: { id: order.id }, data: { paidAt: new Date(Date.now() - daysAgo * 86400_000) } });
    return order;
  }
  const aliceOrder = await seedOrder(alice, [['tavern-barrel', 'COMMERCIAL'], ['viking-sword', 'PERSONAL']], 'USD', 'US', 0, 12);
  await seedOrder(alice, [['ceramic-vase-collection', 'PERSONAL']], 'USD', 'US', 0, 3);
  await seedOrder(bob, [['chess-set-classic', 'PERSONAL'], ['boulder-pack', 'EXTENDED']], 'SEK', 'SE', 2500, 8);
  await seedOrder(chloe, [['tentacle-rigged', 'COMMERCIAL'], ['scifi-cargo-crate', 'PERSONAL']], 'EUR', 'FR', 2000, 5);
  await seedOrder(chloe, [['tavern-barrel', 'PERSONAL']], 'EUR', 'FR', 2000, 1);
  console.log('✓ orders (fulfilled, invoices + licenses issued)');

  const reviews: Array<[string, { id: string }, number, string, string]> = [
    ['tavern-barrel', alice, 5, 'Perfect for my tavern scene', 'Clean topology and it dropped straight into Unreal at the right scale.'],
    ['viking-sword', alice, 4, 'Great hero prop', 'Bevels catch the light beautifully. Would love a scabbard.'],
    ['chess-set-classic', bob, 5, 'Printed beautifully', 'Printed the pawn and rook at 40 mm, zero repairs needed.'],
    ['boulder-pack', bob, 5, 'Detailed rocks', 'Used them all over my terrain.'],
    ['tentacle-rigged', chloe, 4, 'Rig works well', 'Skinning is smooth; the sway loop is a nice touch.'],
    ['tavern-barrel', chloe, 5, 'Super', 'Exactement ce qu’il me fallait.'],
  ];
  for (const [slug, u, rating, title, body] of reviews) await db.review.create({ data: { productId: pid(slug), userId: u.id, rating, title, body, verified: true, status: 'APPROVED', helpfulCount: Math.floor(Math.random() * 12) } });
  await db.review.create({ data: { productId: pid('ringed-planet'), userId: bob.id, rating: 3, title: 'Pending moderation', body: 'Nice but I wanted more ring detail.', verified: false, status: 'PENDING' } });
  for (const slug of new Set(reviews.map((r) => r[0]))) {
    const agg = await db.review.aggregate({ where: { productId: pid(slug), status: 'APPROVED' }, _avg: { rating: true }, _count: true });
    await db.product.update({ where: { id: pid(slug) }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
  }
  await db.question.create({ data: { productId: pid('tavern-barrel'), userId: bob.id, body: 'Is the barrel hollow?', answer: 'Yes — the staves have thickness and the lid is a separate mesh.', answeredAt: new Date(), status: 'APPROVED' } });
  console.log('✓ reviews & Q&A');

  // ── Help center & support ──
  const articles: Array<[string, string, string, string]> = [
    ['download-not-starting', 'My download is not starting', 'Downloads', 'Download links are single-use and expire after 5 minutes for security. Go to **Account → Library** and click **Download** again to get a fresh link. If you see "Download limit reached", contact us and we will reset it.'],
    ['download-limit-reached', 'Download limit reached', 'Downloads', 'Each license includes a generous number of downloads (Personal 15, Commercial 25, Extended 50, Team 100 per seat). Support can reset the counter for you at any time.'],
    ['which-license', 'Which license do I need?', 'Licensing', 'Personal for hobby use, Commercial for client work, ads and film, Extended for games, apps and merchandise sold to end users, and Team for studios (per seat). See the license page for the full comparison.'],
    ['upgrade-license', 'How do I upgrade my license?', 'Licensing', 'Open **Account → Library**, choose the asset and click **Upgrade**. You only pay the difference between your current tier and the new one.'],
    ['refund-policy', 'Can I get a refund?', 'Orders & payment', 'Because files are delivered instantly, EU law lets you waive the 14-day withdrawal right when downloading. We still refund faulty or misdescribed files — contact support within 30 days.'],
    ['vat-invoice', 'How do I get a VAT invoice?', 'Orders & payment', 'Every order includes a PDF invoice with sequential number and VAT details. Add your VAT ID at checkout for EU reverse charge, or request a corrected invoice from **Account → Orders**.'],
    ['import-blender', 'Importing GLB files into Blender', 'Technical', 'Use File → Import → glTF 2.0 (.glb/.gltf). Materials, animations and skins import automatically. Scale is in meters with Y-up; Blender converts to Z-up on import.'],
    ['payment-failed', 'My payment failed', 'Orders & payment', 'Payments can fail when 3-D Secure is not completed or the bank declines. You were not charged for failed attempts. Retry from your cart or try another method such as PayPal, Apple Pay or iDEAL.'],
  ];
  for (const [slug, title, category, body] of articles) await db.helpArticle.create({ data: { slug, title, category, body, tags: [category.toLowerCase()] } });
  await db.cannedReply.createMany({
    data: [
      { title: 'Greeting', shortcut: 'hi', body: 'Hi {{customer.firstName}}, thanks for reaching out! I’m {{agent.firstName}} and I’ll help you with this.', createdBy: admin.id },
      { title: 'Download link refreshed', shortcut: 'dl', body: 'I’ve reset your download limit for order {{order.id}}. Head to your library and click Download — links are valid for 5 minutes.', createdBy: admin.id },
      { title: 'License explanation', shortcut: 'lic', body: 'For games and apps sold to players you need the Extended license. You can upgrade from your library and only pay the difference.', createdBy: admin.id },
      { title: 'Refund requested', shortcut: 'refund', body: 'I’ve submitted a refund request for order {{order.id}} to our finance team. You’ll get an email as soon as it is processed.', createdBy: admin.id },
      { title: 'Closing', shortcut: 'bye', body: 'Glad I could help, {{customer.firstName}}! I’ll mark this as resolved — just reply if anything else comes up.', createdBy: admin.id },
    ],
  });

  const c1 = await db.conversation.create({ data: { customerId: alice.id, subject: 'Barrel textures look dark in Unity', topic: 'TECHNICAL', status: 'PENDING_CUSTOMER', priority: 'NORMAL', assignedAgentId: agent.id, orderId: aliceOrder.id, productId: pid('tavern-barrel'), tags: ['technical', 'unity'], lastMessageAt: new Date(Date.now() - 3600_000), firstResponseAt: new Date(Date.now() - 2 * 3600_000), createdAt: new Date(Date.now() - 3 * 3600_000) } });
  await db.conversationParticipant.createMany({ data: [{ conversationId: c1.id, participantKey: alice.id, userId: alice.id, role: 'CUSTOMER', lastReadAt: new Date() }, { conversationId: c1.id, participantKey: agent.id, userId: agent.id, role: 'AGENT', lastReadAt: new Date() }] });
  const msgs: Array<['CUSTOMER' | 'AGENT', string | null, string, boolean]> = [
    ['CUSTOMER', alice.id, 'Hi! The barrel looks really dark when I import the GLB into Unity 6. Is that expected?', false],
    ['AGENT', agent.id, 'Hi Alice, thanks for reaching out! Unity needs the glTFast package for PBR glTF materials. Could you check that your project uses the Linear color space?', false],
    ['AGENT', agent.id, 'Customer is on Unity 6 URP — likely gamma color space. @agent2 FYI in case she comes back on your shift.', true],
    ['CUSTOMER', alice.id, 'Switching to Linear fixed it, thank you!', false],
  ];
  for (const [i, [senderType, senderId, body, note]] of msgs.entries()) {
    await db.message.create({ data: { conversationId: c1.id, senderType, senderId, body, isInternalNote: note, status: 'READ', clientMessageId: `seed_${c1.id}_${i}`, createdAt: new Date(Date.now() - (3 - i * 0.6) * 3600_000) } });
  }
  const c2 = await db.conversation.create({ data: { guestEmail: 'guest.buyer@example.org', guestName: 'Taylor', subject: 'Do I need Extended for a mobile game?', topic: 'LICENSE', status: 'PENDING_AGENT', priority: 'NORMAL', tags: ['license'], lastMessageAt: new Date(Date.now() - 50 * 60_000), createdAt: new Date(Date.now() - 50 * 60_000) } });
  await db.conversationParticipant.create({ data: { conversationId: c2.id, participantKey: 'guest', role: 'CUSTOMER' } });
  await db.message.create({ data: { conversationId: c2.id, senderType: 'CUSTOMER', body: 'Hello, I want to use the low-poly pines in a free-to-play mobile game with ads. Which license do I need?', clientMessageId: `seed_${c2.id}_0`, status: 'SENT', createdAt: new Date(Date.now() - 50 * 60_000) } });
  const c3 = await db.conversation.create({ data: { customerId: bob.id, subject: 'Download limit reached', topic: 'DOWNLOAD', status: 'PENDING_AGENT', priority: 'HIGH', tags: ['download'], lastMessageAt: new Date(Date.now() - 5 * 3600_000), createdAt: new Date(Date.now() - 5 * 3600_000) } });
  await db.conversationParticipant.create({ data: { conversationId: c3.id, participantKey: bob.id, userId: bob.id, role: 'CUSTOMER' } });
  await db.message.create({ data: { conversationId: c3.id, senderType: 'CUSTOMER', senderId: bob.id, body: 'My boulder pack says download limit reached, I only downloaded it a few times on different PCs.', clientMessageId: `seed_${c3.id}_0`, status: 'SENT', createdAt: new Date(Date.now() - 5 * 3600_000) } });
  console.log('✓ help center, canned replies, conversations');

  console.log(`
Seed complete.
  Admin     admin@stuffin3d.local / ${SEED_PASSWORD.staff}   TOTP secret ${SEED_TOTP.admin}
  Agent     agent@stuffin3d.local / ${SEED_PASSWORD.staff}   TOTP secret ${SEED_TOTP.agent}
  Finance   finance@stuffin3d.local / ${SEED_PASSWORD.staff} TOTP secret ${SEED_TOTP.finance}
  Customer  alice@example.com / ${SEED_PASSWORD.customer}
(Get a current 2FA code with: npm run totp -- ${SEED_TOTP.admin})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

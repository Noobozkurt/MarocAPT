export const LICENSE_TIERS = ['PERSONAL', 'COMMERCIAL', 'EXTENDED', 'EDITORIAL', 'TEAM'] as const;
export type Tier = (typeof LICENSE_TIERS)[number];

export interface TierInfo {
  tier: Tier;
  name: string;
  summary: string;
  can: string[];
  cannot: string[];
  seatBased: boolean;
  minSeats: number;
  /** Rank used for upgrade paths; higher includes the rights of lower ranks (except EDITORIAL). */
  rank: number;
  defaultDownloadLimit: number;
}

export const TIERS: Record<Tier, TierInfo> = {
  PERSONAL: {
    tier: 'PERSONAL',
    name: 'Personal',
    summary: 'For hobby projects, learning and non-commercial portfolio work.',
    can: ['Use in personal, non-commercial renders and projects', 'Show in your portfolio', 'Modify the asset'],
    cannot: ['Use in anything sold or monetised', 'Use in client work', 'Redistribute the source files'],
    seatBased: false,
    minSeats: 1,
    rank: 1,
    defaultDownloadLimit: 15,
  },
  EDITORIAL: {
    tier: 'EDITORIAL',
    name: 'Editorial',
    summary: 'For news, documentary and educational publications.',
    can: ['Use in editorial articles, news and documentaries', 'Use in non-promotional educational material'],
    cannot: ['Use in advertising or merchandise', 'Use in games or apps', 'Redistribute the source files'],
    seatBased: false,
    minSeats: 1,
    rank: 1,
    defaultDownloadLimit: 15,
  },
  COMMERCIAL: {
    tier: 'COMMERCIAL',
    name: 'Commercial',
    summary: 'For client work, ads, films and commercial renders by one person.',
    can: ['Everything in Personal', 'Client work and advertising', 'Film, TV and streaming productions', 'Commercial renders and stills'],
    cannot: ['Embed in games, apps or merch sold to end users (see Extended)', 'Redistribute the source files'],
    seatBased: false,
    minSeats: 1,
    rank: 2,
    defaultDownloadLimit: 25,
  },
  EXTENDED: {
    tier: 'EXTENDED',
    name: 'Extended / Unlimited',
    summary: 'For games, apps, merchandise and products resold to end users.',
    can: ['Everything in Commercial', 'Ship inside games and apps (compiled/packaged)', 'Physical merchandise and 3D prints for sale', 'Unlimited units sold'],
    cannot: ['Resell or share the asset as a standalone file or in asset packs'],
    seatBased: false,
    minSeats: 1,
    rank: 3,
    defaultDownloadLimit: 50,
  },
  TEAM: {
    tier: 'TEAM',
    name: 'Team / Studio',
    summary: 'Extended rights shared by a studio — priced per seat.',
    can: ['Everything in Extended', 'Shared by the number of seats purchased', 'Use across all studio projects'],
    cannot: ['Use by more people than seats purchased', 'Resell or share the asset as a standalone file'],
    seatBased: true,
    minSeats: 2,
    rank: 4,
    defaultDownloadLimit: 100,
  },
};

export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (LICENSE_TIERS as readonly string[]).includes(v);
}

/** Tiers a holder of `from` may upgrade to (paying only the difference). */
export function upgradeTargets(from: Tier): Tier[] {
  const r = TIERS[from].rank;
  return LICENSE_TIERS.filter((t) => t !== 'EDITORIAL' && t !== 'TEAM' && TIERS[t].rank > r);
}

/** Price to upgrade = new tier price − price of the tier already owned (never negative). */
export function upgradePrice(currentTierPrice: number, targetTierPrice: number): number {
  return Math.max(0, targetTierPrice - currentTierPrice);
}

export function normalizeSeats(tier: Tier, seats: number | undefined): number {
  const info = TIERS[tier];
  if (!info.seatBased) return 1;
  const n = Math.floor(Number(seats) || info.minSeats);
  return Math.min(500, Math.max(info.minSeats, n));
}

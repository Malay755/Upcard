import type { CaseBox, ItemCard, Rarity, RollMode } from '../types';

export const HOUSE_EDGE = 0.05; // 5% transparent platform margin (95% RTP)

export const RARITY_ORDER: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export const PROMO_CODES: Record<string, { bonusRate: number; label: string }> = {
  DRIP2026: { bonusRate: 0.25, label: '+25% к депозиту' },
  VANYA: { bonusRate: 0.15, label: '+15% к депозиту' },
  START: { bonusRate: 0.10, label: '+10% к депозиту' },
};

export const DAILY_STREAK_REWARDS = [150, 220, 320, 450, 650, 850, 1200];

export interface UpgradeOdds {
  winChance: number; // 1.00 .. 85.00 (%)
  multiplier: number; // targetPrice / stakeTotal
  minRoll: number;
  maxRoll: number;
}

/**
 * Computes upgrade win chance, multiplier, and winning roll range.
 * Classic CS upgrader math: winChance = (stakeTotal / targetPrice) * (1 - HOUSE_EDGE) * 100
 * Clamped to [1, 85]% to ensure fair bounds.
 */
export function calculateUpgradeOdds(
  stakeTotal: number,
  targetPrice: number,
  mode: RollMode = 'under',
  houseEdge: number = HOUSE_EDGE
): UpgradeOdds {
  if (stakeTotal <= 0 || targetPrice <= 0 || stakeTotal >= targetPrice) {
    return {
      winChance: 0,
      multiplier: 0,
      minRoll: 0,
      maxRoll: 0,
    };
  }

  const rawChance = (stakeTotal / targetPrice) * (1 - houseEdge) * 100;
  const winChance = Number(Math.min(85, Math.max(1, rawChance)).toFixed(2));
  const multiplier = Number((targetPrice / stakeTotal).toFixed(2));

  if (mode === 'under') {
    return {
      winChance,
      multiplier,
      minRoll: 0,
      maxRoll: winChance,
    };
  }

  return {
    winChance,
    multiplier,
    minRoll: Number((100 - winChance).toFixed(2)),
    maxRoll: 100,
  };
}

/**
 * Evaluates whether a roll in [0, 100) wins under the given mode and winChance.
 */
export function resolveUpgradeRoll(
  rollValue: number,
  winChance: number,
  mode: RollMode
): boolean {
  if (winChance <= 0) return false;
  if (mode === 'under') {
    return rollValue < winChance;
  }
  return rollValue >= 100 - winChance;
}

export interface CaseDropProbability {
  item: ItemCard;
  probability: number; // 0 .. 100 (%)
  weight: number;
}

/**
 * Calculates exact normalized drop percentages for every item in a case.
 * Combines the case's rarity weight pool with inverse-price weighting within each rarity tier
 * so higher-tier items inside a rarity still scale fairly with case odds.
 */
export function calculateCaseDropProbabilities(
  caseBox: Pick<CaseBox, 'rarityWeights'>,
  caseItems: ItemCard[]
): CaseDropProbability[] {
  if (caseItems.length === 0) return [];

  // Group items by rarity
  const byRarity: Record<Rarity, ItemCard[]> = {
    common: [],
    rare: [],
    epic: [],
    legendary: [],
  };

  for (const item of caseItems) {
    byRarity[item.rarity].push(item);
  }

  // Only rarities that actually have items in this case contribute to the pool
  const rawWeights: { item: ItemCard; weight: number }[] = [];
  let totalWeight = 0;

  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
    const tierItems = byRarity[rarity];
    if (tierItems.length === 0) continue;

    const tierPoolWeight = Math.max(0, caseBox.rarityWeights[rarity] ?? 0);
    if (tierPoolWeight <= 0) continue;

    // Distribute tierPoolWeight among items of that rarity inversely proportional to sqrt(price)
    const invPrices = tierItems.map((it) => 1 / Math.sqrt(Math.max(1, it.price)));
    const invSum = invPrices.reduce((a, b) => a + b, 0);

    tierItems.forEach((item, idx) => {
      const share = invSum > 0 ? invPrices[idx] / invSum : 1 / tierItems.length;
      const w = tierPoolWeight * share;
      rawWeights.push({ item, weight: w });
      totalWeight += w;
    });
  }

  if (totalWeight <= 0) {
    const equalProb = Number((100 / caseItems.length).toFixed(2));
    return caseItems.map((item) => ({
      item,
      probability: equalProb,
      weight: 1,
    }));
  }

  return rawWeights
    .map(({ item, weight }) => ({
      item,
      weight,
      probability: Number(((weight / totalWeight) * 100).toFixed(2)),
    }))
    .sort((a, b) => a.item.price - b.item.price);
}

/**
 * Picks a winning item deterministically from calculated probabilities and rngValue in [0, 1).
 */
export function pickWeightedCaseDrop(
  probabilities: CaseDropProbability[],
  rngValue: number
): ItemCard {
  const totalWeight = probabilities.reduce((sum, entry) => sum + entry.weight, 0);
  const clampedRng = Math.min(0.9999999, Math.max(0, rngValue));
  let cursor = clampedRng * totalWeight;

  for (const entry of probabilities) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.item;
    }
  }

  return probabilities[probabilities.length - 1].item;
}

/**
 * Calculates total T-Coin credited after applying a promo code.
 */
export function calculateDepositWithPromo(
  baseAmount: number,
  promoCode?: string
): { baseAmount: number; bonusAmount: number; totalCredited: number; appliedPromo: string | null } {
  const safeBase = Math.max(0, Math.round(baseAmount));
  const normalized = (promoCode ?? '').trim().toUpperCase();
  const promo = normalized ? PROMO_CODES[normalized] : undefined;

  if (!promo || safeBase <= 0) {
    return {
      baseAmount: safeBase,
      bonusAmount: 0,
      totalCredited: safeBase,
      appliedPromo: null,
    };
  }

  const bonusAmount = Math.round(safeBase * promo.bonusRate);
  return {
    baseAmount: safeBase,
    bonusAmount,
    totalCredited: safeBase + bonusAmount,
    appliedPromo: normalized,
  };
}

/**
 * Computes daily reward for streak day (1-indexed, cycles every 7 days).
 */
export function calculateDailyReward(streakDay: number): number {
  const normalizedIdx = ((Math.max(1, streakDay) - 1) % DAILY_STREAK_REWARDS.length);
  return DAILY_STREAK_REWARDS[normalizedIdx];
}

export function formatTC(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

import type { ItemCard, Rarity } from '../types';

export const RARITY_DISCOVERY_XP: Record<Rarity, number> = {
  common: 25,
  rare: 50,
  super_rare: 120,
  epic: 250,
  legendary: 600,
};

export interface LevelProgressInfo {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  title: string;
}

/**
 * Returns the one-time discovery XP earned when a player unlocks a card for the first time.
 */
export function getCardDiscoveryXp(
  itemOrRarity: Pick<ItemCard, 'rarity'> | Rarity | null | undefined
): number {
  if (!itemOrRarity) return RARITY_DISCOVERY_XP.rare;
  const rarity = typeof itemOrRarity === 'string' ? itemOrRarity : itemOrRarity.rarity;
  return RARITY_DISCOVERY_XP[rarity] ?? RARITY_DISCOVERY_XP.rare;
}

/**
 * XP needed to advance from `level` to `level + 1`.
 */
export function getXpRequiredForLevelUp(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return 100 + (safeLevel - 1) * 75;
}

/**
 * Returns the rank title corresponding to a player's level.
 */
export function getLevelTitle(level: number): string {
  if (level >= 15) return 'Легенда Фермы';
  if (level >= 11) return 'Магистр карт';
  if (level >= 8) return 'Хранитель архива';
  if (level >= 5) return 'Коллекционер';
  if (level >= 3) return 'Искатель';
  return 'Новичок';
}

/**
 * Computes the player's current level and XP bar progress from total accumulated XP.
 */
export function getLevelProgress(totalXp: number): LevelProgressInfo {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  let remaining = safeTotal;
  let needed = getXpRequiredForLevelUp(level);

  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = getXpRequiredForLevelUp(level);
  }

  const progressPercent = needed > 0 ? Math.min(100, Math.max(0, (remaining / needed) * 100)) : 0;

  return {
    level,
    totalXp: safeTotal,
    currentLevelXp: remaining,
    nextLevelXp: needed,
    progressPercent: Number(progressPercent.toFixed(1)),
    title: getLevelTitle(level),
  };
}

/**
 * Computes total possible discovery XP across a given card catalog.
 */
export function getTotalCatalogXp(items: Pick<ItemCard, 'rarity'>[]): number {
  return items.reduce((sum, item) => sum + getCardDiscoveryXp(item), 0);
}

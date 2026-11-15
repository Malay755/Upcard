import type { ItemCard, Rarity } from '../types';

export const CONTRACT_REQUIRED_COUNT = 7;

export const NEXT_CONTRACT_RARITY: Record<Rarity, Rarity | null> = {
  common: 'rare',
  rare: 'super_rare',
  super_rare: 'epic',
  epic: 'legendary',
  legendary: null,
};

export interface ContractDropOutcome {
  item: ItemCard;
  probability: number; // 0 .. 100
  weight: number;
}

export interface ContractPreview {
  eligible: boolean;
  reason?: string;
  inputRarity: Rarity | null;
  targetRarity: Rarity | null;
  targetPool: ContractDropOutcome[];
  minTargetPrice: number;
  maxTargetPrice: number;
}

export function getNextContractRarity(rarity: Rarity): Rarity | null {
  return NEXT_CONTRACT_RARITY[rarity] ?? null;
}

/**
 * Computes weighted probability distribution across catalog cards in the target rarity.
 * Uses inverse-sqrt(price) weighting normalized to 100%, matching the platform's case drop math.
 */
export function calculateContractOutcomes(
  targetRarity: Rarity,
  catalogItems: ItemCard[]
): ContractDropOutcome[] {
  const pool = catalogItems
    .filter((item) => item.rarity === targetRarity)
    .sort((a, b) => a.price - b.price);

  if (pool.length === 0) return [];

  const rawWeights = pool.map((item) => ({
    item,
    weight: 1 / Math.sqrt(Math.max(1, item.price)),
  }));
  const totalWeight = rawWeights.reduce((sum, entry) => sum + entry.weight, 0);

  const outcomes = rawWeights.map(({ item, weight }) => ({
    item,
    weight,
    probability: Number(((weight / totalWeight) * 100).toFixed(2)),
  }));

  const roundedSum = outcomes.reduce((sum, entry) => sum + entry.probability, 0);
  const largestIdx = outcomes.reduce(
    (best, entry, idx, arr) => (entry.probability > arr[best].probability ? idx : best),
    0
  );
  outcomes[largestIdx].probability = Number(
    (outcomes[largestIdx].probability + 100 - roundedSum).toFixed(2)
  );

  return outcomes;
}

/**
 * Validates selected input items and produces a transparent Contract preview.
 */
export function buildContractPreview(
  selectedItems: ItemCard[],
  catalogItems: ItemCard[]
): ContractPreview {
  if (selectedItems.length === 0) {
    return {
      eligible: false,
      reason: `Выберите ${CONTRACT_REQUIRED_COUNT} карт одной редкости`,
      inputRarity: null,
      targetRarity: null,
      targetPool: [],
      minTargetPrice: 0,
      maxTargetPrice: 0,
    };
  }

  const firstRarity = selectedItems[0].rarity;
  if (selectedItems.some((item) => item.rarity !== firstRarity)) {
    return {
      eligible: false,
      reason: 'Все 7 карт контракта должны быть одной редкости.',
      inputRarity: null,
      targetRarity: null,
      targetPool: [],
      minTargetPrice: 0,
      maxTargetPrice: 0,
    };
  }

  const targetRarity = getNextContractRarity(firstRarity);
  if (!targetRarity) {
    return {
      eligible: false,
      reason: 'Легендарные карты — максимальная редкость для контрактов.',
      inputRarity: firstRarity,
      targetRarity: null,
      targetPool: [],
      minTargetPrice: 0,
      maxTargetPrice: 0,
    };
  }

  const targetPool = calculateContractOutcomes(targetRarity, catalogItems);
  if (targetPool.length === 0) {
    return {
      eligible: false,
      reason: 'В каталоге пока нет карт следующей редкости.',
      inputRarity: firstRarity,
      targetRarity,
      targetPool: [],
      minTargetPrice: 0,
      maxTargetPrice: 0,
    };
  }

  const minTargetPrice = targetPool[0].item.price;
  const maxTargetPrice = targetPool[targetPool.length - 1].item.price;

  if (selectedItems.length !== CONTRACT_REQUIRED_COUNT) {
    return {
      eligible: false,
      reason: `Выберите ещё ${CONTRACT_REQUIRED_COUNT - selectedItems.length} шт. (${selectedItems.length}/${CONTRACT_REQUIRED_COUNT})`,
      inputRarity: firstRarity,
      targetRarity,
      targetPool,
      minTargetPrice,
      maxTargetPrice,
    };
  }

  return {
    eligible: true,
    inputRarity: firstRarity,
    targetRarity,
    targetPool,
    minTargetPrice,
    maxTargetPrice,
  };
}

/**
 * Deterministically selects the crafted output card from normalized contract outcomes.
 */
export function pickContractOutcome(outcomes: ContractDropOutcome[], rngValue: number): ItemCard {
  const totalWeight = outcomes.reduce((sum, entry) => sum + entry.weight, 0);
  const clampedRng = Math.min(0.9999999, Math.max(0, rngValue));
  let cursor = clampedRng * totalWeight;

  for (const entry of outcomes) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }

  return outcomes[outcomes.length - 1].item;
}

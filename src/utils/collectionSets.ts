import type { ItemCard } from '../types';
import { resolveCardCollection } from './collections';
import { getCardDiscoveryXp } from './progression';

export interface CollectionSetBadgeMeta {
  badgeTitle: string;
  badgeStyleClass: string;
}

export const COLLECTION_SET_BADGES: Record<string, CollectionSetBadgeMeta> = {
  Даун: {
    badgeTitle: 'Хранитель мемного архива',
    badgeStyleClass: 'bg-rose-500/15 border-rose-400/35 text-rose-300',
  },
  Артемий: {
    badgeTitle: 'Старший по Артемию',
    badgeStyleClass: 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300',
  },
  Тимур: {
    badgeTitle: 'Хранитель Волги',
    badgeStyleClass: 'bg-amber-500/15 border-amber-400/35 text-amber-300',
  },
  Майкл: {
    badgeTitle: 'Секретный агент',
    badgeStyleClass: 'bg-sky-500/15 border-sky-400/35 text-sky-300',
  },
  Ваня: {
    badgeTitle: 'Дрип-легенда',
    badgeStyleClass: 'bg-violet-500/15 border-violet-400/35 text-violet-300',
  },
  Кирилл: {
    badgeTitle: 'Мастер Кири-тян',
    badgeStyleClass: 'bg-fuchsia-500/15 border-fuchsia-400/35 text-fuchsia-300',
  },
  Сквад: {
    badgeTitle: 'Основатель Сквада',
    badgeStyleClass: 'bg-[#FACC15]/15 border-[#FACC15]/40 text-[#FACC15]',
  },
};

export interface CollectionSetReward {
  collection: string;
  rewardTc: number;
  rewardXp: number;
  badgeTitle: string;
  badgeStyleClass: string;
  totalCards: number;
  unlockedCards: number;
  isComplete: boolean;
  isClaimed: boolean;
}

export function getCollectionBadgeMeta(collection: string): CollectionSetBadgeMeta {
  return (
    COLLECTION_SET_BADGES[collection] ?? {
      badgeTitle: `Сет «${collection}»`,
      badgeStyleClass: 'bg-[#FACC15]/15 border-[#FACC15]/35 text-[#FACC15]',
    }
  );
}

/**
 * Evaluates completion state and one-time TC/XP reward for a given card collection.
 */
export function evaluateCollectionSetStatus(
  collection: string,
  items: ItemCard[],
  unlockedItemIds: string[],
  claimedCollections: string[] = []
): CollectionSetReward {
  const unlockedSet = new Set(unlockedItemIds);
  const collectionItems = items.filter((item) => resolveCardCollection(item) === collection);
  const totalCards = collectionItems.length;
  const unlockedCards = collectionItems.filter((item) => unlockedSet.has(item.id)).length;
  const isComplete = totalCards > 0 && unlockedCards === totalCards;
  const isClaimed = claimedCollections.includes(collection);

  const totalValue = collectionItems.reduce((sum, item) => sum + item.price, 0);
  const totalDiscoveryXp = collectionItems.reduce((sum, item) => sum + getCardDiscoveryXp(item), 0);

  const rewardTc = totalCards > 0 ? Math.max(150, Math.round((totalValue * 0.12) / 10) * 10) : 0;
  const rewardXp = totalCards > 0 ? Math.max(120, Math.round((totalDiscoveryXp * 0.45) / 10) * 10) : 0;

  const badge = getCollectionBadgeMeta(collection);

  return {
    collection,
    rewardTc,
    rewardXp,
    badgeTitle: badge.badgeTitle,
    badgeStyleClass: badge.badgeStyleClass,
    totalCards,
    unlockedCards,
    isComplete,
    isClaimed,
  };
}

import type {
  AchievementCategory,
  AchievementId,
  ItemCard,
  Transaction,
  UpgradeHistoryEntry,
  UserAchievementStats,
  UserProfile,
} from '../types';
import { getAvailableCollections } from './collections';
import { evaluateCollectionSetStatus } from './collectionSets';
import { getLevelProgress } from './progression';

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  category: AchievementCategory;
  categoryLabel: string;
  rewardTc: number;
  rewardXp: number;
}

export interface AchievementProgress extends AchievementDefinition {
  progress: number;
  maxProgress: number;
  progressPercent: number;
  unlocked: boolean;
  claimed: boolean;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'ACH_UPG_SNIPER',
    title: 'Лакер',
    description: 'Победить в апгрейде с шансом ≤ 15%',
    category: 'upgrades',
    categoryLabel: 'Апгрейды',
    rewardTc: 400,
    rewardXp: 150,
  },
  {
    id: 'ACH_UPG_LOSE_STREAK',
    title: 'Лохость',
    description: 'Проиграть 5 апгрейдов подряд (утешительный приз)',
    category: 'upgrades',
    categoryLabel: 'Апгрейды',
    rewardTc: 250,
    rewardXp: 100,
  },
  {
    id: 'ACH_UPG_MULTI_WIN',
    title: 'Насосал',
    description: 'Выиграть 3 апгрейда подряд',
    category: 'upgrades',
    categoryLabel: 'Апгрейды',
    rewardTc: 350,
    rewardXp: 150,
  },
  {
    id: 'ACH_DIARY_HALF',
    title: 'Новичок в картах',
    description: 'Открыть не менее 50% всех карт в Коллекционном дневнике',
    category: 'collection',
    categoryLabel: 'Коллекция',
    rewardTc: 500,
    rewardXp: 250,
  },
  {
    id: 'ACH_DIARY_FIRST_SET',
    title: 'Донатер',
    description: 'Собрать 100% любой одной коллекции',
    category: 'collection',
    categoryLabel: 'Коллекция',
    rewardTc: 450,
    rewardXp: 200,
  },
  {
    id: 'ACH_DIARY_LEVEL_10',
    title: 'Коллекционер',
    description: 'Достичь 10-го уровня профиля',
    category: 'collection',
    categoryLabel: 'Коллекция',
    rewardTc: 700,
    rewardXp: 300,
  },
  {
    id: 'ACH_CASE_LEGEND',
    title: '322',
    description: 'Выбить любую легендарную карту из кейса',
    category: 'cases_social',
    categoryLabel: 'Кейсы и батлы',
    rewardTc: 600,
    rewardXp: 300,
  },
  {
    id: 'ACH_BATTLE_FIRST_WIN',
    title: 'Выебал',
    description: 'Одержать первую победу в батле с другим игроком',
    category: 'cases_social',
    categoryLabel: 'Кейсы и батлы',
    rewardTc: 350,
    rewardXp: 150,
  },
  {
    id: 'ACH_SOCIAL_SQUAD',
    title: 'Ш-общительный',
    description: 'Добавить 3 друзей по коду или ссылке',
    category: 'cases_social',
    categoryLabel: 'Кейсы и батлы',
    rewardTc: 300,
    rewardXp: 150,
  },
];

export function createEmptyAchievementStats(): UserAchievementStats {
  return {
    upgradeWinStreak: 0,
    maxUpgradeWinStreak: 0,
    upgradeLoseStreak: 0,
    maxUpgradeLoseStreak: 0,
    lowChanceUpgradeWin: false,
    legendaryCaseDrop: false,
    battleWins: 0,
  };
}

/**
 * Reconstructs/merges historical stats cleanly from persisted upgradeHistory and transactions.
 */
export function computeMergedAchievementStats(
  user: Pick<UserProfile, 'id' | 'achievementStats'>,
  items: ItemCard[],
  upgradeHistory: UpgradeHistoryEntry[] = [],
  transactions: Transaction[] = [],
  battleWinCount = 0
): UserAchievementStats {
  const existing = user.achievementStats ?? createEmptyAchievementStats();

  // Compute streaks chronologically from persisted upgrade history for this user
  const sortedUpgrades = upgradeHistory
    .filter((entry) => entry.userId === user.id)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  let winStreak = 0;
  let maxWinStreak = 0;
  let loseStreak = 0;
  let maxLoseStreak = 0;
  let lowChanceWin = false;

  for (const entry of sortedUpgrades) {
    if (entry.won) {
      winStreak += 1;
      loseStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
      if (entry.winChance <= 15) {
        lowChanceWin = true;
      }
    } else {
      loseStreak += 1;
      winStreak = 0;
      maxLoseStreak = Math.max(maxLoseStreak, loseStreak);
    }
  }

  const legendaryNames = new Set(
    items.filter((item) => item.rarity === 'legendary').map((item) => item.name)
  );
  const legendaryFromCaseTx = transactions.some(
    (tx) =>
      tx.userId === user.id &&
      tx.type === 'case_open' &&
      tx.meta?.startsWith('Выпал: ') &&
      legendaryNames.has(tx.meta.slice('Выпал: '.length))
  );

  const battleWinsFromTx = transactions.filter(
    (tx) => tx.userId === user.id && tx.type === 'battle_win'
  ).length;

  return {
    upgradeWinStreak: sortedUpgrades.length > 0 ? winStreak : Math.max(0, existing.upgradeWinStreak),
    maxUpgradeWinStreak: Math.max(existing.maxUpgradeWinStreak ?? 0, maxWinStreak),
    upgradeLoseStreak: sortedUpgrades.length > 0 ? loseStreak : Math.max(0, existing.upgradeLoseStreak),
    maxUpgradeLoseStreak: Math.max(existing.maxUpgradeLoseStreak ?? 0, maxLoseStreak),
    lowChanceUpgradeWin: Boolean(existing.lowChanceUpgradeWin || lowChanceWin),
    legendaryCaseDrop: Boolean(existing.legendaryCaseDrop || legendaryFromCaseTx),
    battleWins: Math.max(existing.battleWins ?? 0, battleWinsFromTx, battleWinCount),
  };
}

/**
 * Evaluates all 9 achievements and their exact progress for a player profile.
 */
export function evaluateAchievements(
  user: Pick<
    UserProfile,
    | 'xp'
    | 'unlockedItemIds'
    | 'inventory'
    | 'friends'
    | 'claimedCollectionRewards'
    | 'unlockedAchievementIds'
    | 'claimedAchievementIds'
    | 'achievementStats'
  >,
  items: ItemCard[]
): AchievementProgress[] {
  const stats = user.achievementStats ?? createEmptyAchievementStats();
  const unlockedItemSet = new Set([
    ...(user.unlockedItemIds ?? []),
    ...(user.inventory ?? []).map((inv) => inv.itemId),
  ]);
  const unlockedItemIds = [...unlockedItemSet];
  const unlockedCardsCount = items.filter((item) => unlockedItemSet.has(item.id)).length;
  const diaryHalfTarget = Math.max(1, Math.ceil(items.length * 0.5));

  const collections = getAvailableCollections(items);
  const hasAnyCompleteSet = collections.some(
    (col) =>
      evaluateCollectionSetStatus(
        col,
        items,
        unlockedItemIds,
        user.claimedCollectionRewards ?? []
      ).isComplete
  );

  const levelInfo = getLevelProgress(user.xp ?? 0);
  const friendsCount = (user.friends ?? []).length;
  const previouslyUnlocked = new Set(user.unlockedAchievementIds ?? []);
  const claimedSet = new Set(user.claimedAchievementIds ?? []);

  return ACHIEVEMENT_DEFINITIONS.map((def) => {
    let progress = 0;
    let maxProgress = 1;

    switch (def.id) {
      case 'ACH_UPG_SNIPER':
        maxProgress = 1;
        progress = stats.lowChanceUpgradeWin ? 1 : 0;
        break;
      case 'ACH_UPG_LOSE_STREAK':
        maxProgress = 5;
        progress = Math.min(5, Math.max(stats.maxUpgradeLoseStreak, stats.upgradeLoseStreak));
        break;
      case 'ACH_UPG_MULTI_WIN':
        maxProgress = 3;
        progress = Math.min(3, Math.max(stats.maxUpgradeWinStreak, stats.upgradeWinStreak));
        break;
      case 'ACH_DIARY_HALF':
        maxProgress = diaryHalfTarget;
        progress = Math.min(diaryHalfTarget, unlockedCardsCount);
        break;
      case 'ACH_DIARY_FIRST_SET':
        maxProgress = 1;
        progress = hasAnyCompleteSet ? 1 : 0;
        break;
      case 'ACH_DIARY_LEVEL_10':
        maxProgress = 10;
        progress = Math.min(10, levelInfo.level);
        break;
      case 'ACH_CASE_LEGEND':
        maxProgress = 1;
        progress = stats.legendaryCaseDrop ? 1 : 0;
        break;
      case 'ACH_BATTLE_FIRST_WIN':
        maxProgress = 1;
        progress = stats.battleWins >= 1 ? 1 : 0;
        break;
      case 'ACH_SOCIAL_SQUAD':
        maxProgress = 3;
        progress = Math.min(3, friendsCount);
        break;
    }

    const unlocked = previouslyUnlocked.has(def.id) || progress >= maxProgress;
    if (unlocked) progress = maxProgress;

    const progressPercent =
      maxProgress > 0 ? Math.min(100, Math.round((progress / maxProgress) * 100)) : 0;

    return {
      ...def,
      progress,
      maxProgress,
      progressPercent,
      unlocked,
      claimed: claimedSet.has(def.id),
    };
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ItemCard, Transaction, UpgradeHistoryEntry, UserProfile } from '../types';
import { computeMergedAchievementStats, evaluateAchievements } from './achievements';

const SAMPLE_ITEMS: ItemCard[] = [
  { id: 'c1', name: 'Артемий Даун', rarity: 'rare', collection: 'Даун', price: 360, imageUrl: '/a.png', createdAt: 1 },
  { id: 'c2', name: 'Даун Тимур', rarity: 'epic', collection: 'Даун', price: 1500, imageUrl: '/b.png', createdAt: 1 },
  { id: 'c3', name: 'Майкл Пиздюк', rarity: 'rare', collection: 'Майкл', price: 460, imageUrl: '/c.png', createdAt: 1 },
  { id: 'c4', name: 'Сумашедший Артемий', rarity: 'legendary', collection: 'Артемий', price: 7800, imageUrl: '/d.png', createdAt: 1 },
];

function makeBaseUser(): UserProfile {
  return {
    id: 'u1',
    username: 'Tester',
    avatarColor: '#FACC15',
    balance: 1000,
    referralCode: 'REF',
    friendCode: 'FR-1',
    friends: [],
    topDropItemId: null,
    topDropPrice: 0,
    referredByCode: null,
    referralCount: 0,
    referralEarned: 0,
    dailyStreak: 0,
    lastDailyClaimAt: null,
    totalDeposited: 0,
    totalUpgrades: 0,
    wonUpgrades: 0,
    totalCasesOpened: 0,
    xp: 0,
    unlockedItemIds: [],
    claimedCollectionRewards: [],
    equippedBadgeCollection: null,
    showcaseItemIds: [],
    unlockedAchievementIds: [],
    claimedAchievementIds: [],
    inventory: [],
    createdAt: 1,
  };
}

test('computeMergedAchievementStats tracks win/lose streaks, low-chance wins, legendary case drops, and battle wins', () => {
  const user = makeBaseUser();
  const history: UpgradeHistoryEntry[] = [
    { id: 'h1', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 10, multiplier: 9.5, rollMode: 'under', rollValue: 5, won: true, createdAt: 10 },
    { id: 'h2', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 10, won: true, createdAt: 20 },
    { id: 'h3', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 10, won: true, createdAt: 30 },
    { id: 'h4', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 90, won: false, createdAt: 40 },
    { id: 'h5', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 90, won: false, createdAt: 50 },
    { id: 'h6', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 90, won: false, createdAt: 60 },
    { id: 'h7', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 90, won: false, createdAt: 70 },
    { id: 'h8', userId: 'u1', stakeItemIds: [], stakeBalanceAdded: 100, stakeTotal: 100, targetItemId: 'c2', targetPrice: 1500, winChance: 50, multiplier: 1.9, rollMode: 'under', rollValue: 90, won: false, createdAt: 80 },
  ];
  const txs: Transaction[] = [
    { id: 't1', userId: 'u1', type: 'case_open', amount: -500, balanceAfter: 500, description: 'Open', meta: 'Выпал: Сумашедший Артемий', createdAt: 90 },
    { id: 't2', userId: 'u1', type: 'battle_win', amount: 0, balanceAfter: 500, description: 'Battle', createdAt: 95 },
  ];

  const merged = computeMergedAchievementStats(user, SAMPLE_ITEMS, history, txs);
  assert.equal(merged.lowChanceUpgradeWin, true);
  assert.equal(merged.maxUpgradeWinStreak, 3);
  assert.equal(merged.maxUpgradeLoseStreak, 5);
  assert.equal(merged.legendaryCaseDrop, true);
  assert.equal(merged.battleWins, 1);
});

test('evaluateAchievements maps all 9 user titles and unlocks based on collection, level, and friends', () => {
  const user = makeBaseUser();
  user.unlockedItemIds = ['c1', 'c2']; // 2/4 = 50% and completes "Даун"
  user.friends = ['f1', 'f2', 'f3'];
  user.xp = 4500; // > level 10
  user.achievementStats = computeMergedAchievementStats(user, SAMPLE_ITEMS, [], [], 0);

  const list = evaluateAchievements(user, SAMPLE_ITEMS);
  const byId = new Map(list.map((a) => [a.id, a]));

  assert.equal(byId.get('ACH_UPG_SNIPER')?.title, 'Лакер');
  assert.equal(byId.get('ACH_UPG_LOSE_STREAK')?.title, 'Лохость');
  assert.equal(byId.get('ACH_UPG_MULTI_WIN')?.title, 'Насосал');
  assert.equal(byId.get('ACH_DIARY_HALF')?.title, 'Новичок в картах');
  assert.equal(byId.get('ACH_DIARY_FIRST_SET')?.title, 'Донатер');
  assert.equal(byId.get('ACH_DIARY_LEVEL_10')?.title, 'Коллекционер');
  assert.equal(byId.get('ACH_CASE_LEGEND')?.title, '322');
  assert.equal(byId.get('ACH_BATTLE_FIRST_WIN')?.title, 'Выебал');
  assert.equal(byId.get('ACH_SOCIAL_SQUAD')?.title, 'Ш-общительный');

  assert.equal(byId.get('ACH_DIARY_HALF')?.unlocked, true);
  assert.equal(byId.get('ACH_DIARY_FIRST_SET')?.unlocked, true);
  assert.equal(byId.get('ACH_DIARY_LEVEL_10')?.unlocked, true);
  assert.equal(byId.get('ACH_SOCIAL_SQUAD')?.unlocked, true);
  assert.equal(byId.get('ACH_CASE_LEGEND')?.unlocked, false);
});

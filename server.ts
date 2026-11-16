import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import type {
  AchievementId,
  BootstrapPayload,
  BattleInvitationSummary,
  BattleMode,
  BattleRoomSummary,
  CaseBox,
  FriendRequestSummary,
  FriendProfile,
  FriendSummary,
  InventoryItem,
  ItemCard,
  LiveDropEntry,
  MinigameId,
  MinigameStatusMap,
  MinesBoardState,
  Rarity,
  RollMode,
  Transaction,
  UserProfile,
  UpgradeHistoryEntry,
} from './src/types.ts';
import {
  calculateCaseDropProbabilities,
  calculateDailyReward,
  calculateUpgradeOdds,
  pickWeightedCaseDrop,
  resolveUpgradeRoll,
  calculateCaseExpectedValue,
  recommendedCasePrice,
} from './src/utils/economics.ts';
import { inferCardCollection } from './src/utils/collections.ts';
import { getCardDiscoveryXp } from './src/utils/progression.ts';
import { evaluateCollectionSetStatus } from './src/utils/collectionSets.ts';
import {
  CONTRACT_REQUIRED_COUNT,
  calculateContractOutcomes,
  getNextContractRarity,
  pickContractOutcome,
} from './src/utils/contracts.ts';
import {
  ACHIEVEMENT_DEFINITIONS,
  computeMergedAchievementStats,
  createEmptyAchievementStats,
  evaluateAchievements,
} from './src/utils/achievements.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public', 'uploads');

interface DatabaseSchema {
  items: ItemCard[];
  cases: CaseBox[];
  users: UserProfile[];
  transactions: Transaction[];
  upgradeHistory: UpgradeHistoryEntry[];
  liveDrops: LiveDropEntry[];
  friendRequests: PersistedFriendRequest[];
  battleInvitations: PersistedBattleInvitation[];
  battles: PersistedBattleRoom[];
  minigameSessions?: PersistedMinigameSession[];
  sessionSecret?: string;
  revokedTokens?: string[];
  authVersion?: number;
  economyVersion?: number;
  catalogVersion?: number;
  consumedTelegramHashes?: { hash: string; expiresAt: number }[];
}

interface PersistedMinigameSession {
  id: string;
  userId: string;
  game: MinigameId;
  status: 'active' | 'completed' | 'busted';
  startedAt: number;
  expiresAt: number;
  mineIndices?: number[];
  revealedSafe?: number[];
  currentBank?: number;
}

interface PersistedFriendRequest { id: string; fromUserId: string; toUserId: string; createdAt: number }
interface PersistedBattleInvitation { id: string; roomId: string; fromUserId: string; toUserId: string; status: 'pending' | 'accepted' | 'declined'; createdAt: number }
interface PersistedBattleRound { round: number; hostDrop: ItemCard; guestDrop: ItemCard }
interface PersistedBattleRoom {
  id: string;
  mode: BattleMode;
  status: 'waiting' | 'completed' | 'cancelled';
  hostUserId: string;
  hostUsername: string;
  guestUserId: string | null;
  guestUsername: string | null;
  hasPassword: boolean;
  passwordHash?: string;
  caseId?: string;
  caseName?: string;
  caseCount?: number;
  hostItems: InventoryItem[];
  hostStakeValue: number;
  guestItems?: InventoryItem[];
  guestStakeValue: number;
  createdAt: number;
  startedAt?: number;
  durationMs?: number;
  winnerUserId?: string | null;
  hostWinChance?: number;
  rollValue?: number;
  roundResults?: PersistedBattleRound[];
  awardedInventoryIds?: string[];
  awardedInventoryIdsByUser?: Record<string, string[]>;
}

const socketsByUser = new Map<string, Set<WebSocket>>();

const MINIGAME_MAX_CHARGES = 3;
const MINIGAME_RECHARGE_MS = 180_000; // +1 ticket every 3 minutes
const MINES_GRID_SIZE = 16;
const MINES_TRAP_COUNT = 3;
const MINES_STEP_BONUSES = [30, 35, 40, 50, 60, 75, 95, 115, 130, 140, 150, 160, 180];

function createDefaultMinigameEnergy(now = Date.now()): NonNullable<UserProfile['minigameEnergy']> {
  return {
    harvest: { charges: MINIGAME_MAX_CHARGES, lastRechargeAt: now, bestScore: 0, playsCount: 0 },
    mines: { charges: MINIGAME_MAX_CHARGES, lastRechargeAt: now, bestScore: 0, playsCount: 0 },
    race: { charges: MINIGAME_MAX_CHARGES, lastRechargeAt: now, bestScore: 0, playsCount: 0 },
  };
}

function syncMinigameEnergy(user: UserProfile, now = Date.now()): NonNullable<UserProfile['minigameEnergy']> {
  if (!user.minigameEnergy) {
    user.minigameEnergy = createDefaultMinigameEnergy(now);
  }
  const games: MinigameId[] = ['harvest', 'mines', 'race'];
  for (const game of games) {
    const slot = user.minigameEnergy[game] ?? {
      charges: MINIGAME_MAX_CHARGES,
      lastRechargeAt: now,
      bestScore: 0,
      playsCount: 0,
    };
    slot.charges = Math.max(0, Math.min(MINIGAME_MAX_CHARGES, Math.floor(Number(slot.charges) || 0)));
    slot.lastRechargeAt = Number.isFinite(slot.lastRechargeAt) && slot.lastRechargeAt > 0 ? slot.lastRechargeAt : now;
    slot.bestScore = Math.max(0, Math.floor(Number(slot.bestScore) || 0));
    slot.playsCount = Math.max(0, Math.floor(Number(slot.playsCount) || 0));

    if (slot.charges < MINIGAME_MAX_CHARGES) {
      const elapsed = Math.max(0, now - slot.lastRechargeAt);
      const gained = Math.floor(elapsed / MINIGAME_RECHARGE_MS);
      if (gained > 0) {
        slot.charges = Math.min(MINIGAME_MAX_CHARGES, slot.charges + gained);
        slot.lastRechargeAt = slot.charges >= MINIGAME_MAX_CHARGES
          ? now
          : slot.lastRechargeAt + gained * MINIGAME_RECHARGE_MS;
      }
    } else {
      slot.lastRechargeAt = now;
    }
    user.minigameEnergy[game] = slot;
  }
  return user.minigameEnergy;
}

function getMinigameStatusMap(user?: UserProfile, now = Date.now()): MinigameStatusMap {
  const games: MinigameId[] = ['harvest', 'mines', 'race'];
  const energy = user ? syncMinigameEnergy(user, now) : createDefaultMinigameEnergy(now);
  const result = {} as MinigameStatusMap;
  for (const game of games) {
    const slot = energy[game];
    result[game] = {
      charges: slot.charges,
      maxCharges: MINIGAME_MAX_CHARGES,
      nextRechargeAt: slot.charges < MINIGAME_MAX_CHARGES ? slot.lastRechargeAt + MINIGAME_RECHARGE_MS : null,
      bestScore: slot.bestScore,
      playsCount: slot.playsCount,
    };
  }
  return result;
}

function publicMinesBoard(session: PersistedMinigameSession): MinesBoardState {
  const revealedSafe = session.revealedSafe ?? [];
  const nextIdx = Math.min(revealedSafe.length, MINES_STEP_BONUSES.length - 1);
  return {
    sessionId: session.id,
    gridSize: MINES_GRID_SIZE,
    minesCount: MINES_TRAP_COUNT,
    revealedSafe,
    mineLocations: session.status === 'active' ? undefined : (session.mineIndices ?? []),
    currentBank: session.currentBank ?? 0,
    nextStepBonus: MINES_STEP_BONUSES[nextIdx],
    status: session.status === 'active'
      ? 'playing'
      : session.status === 'busted'
      ? 'busted'
      : 'cashed_out',
  };
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function createFriendCode(existingUsers: UserProfile[] = []): string {
  const used = new Set(existingUsers.map((user) => user.friendCode?.toUpperCase()).filter(Boolean));
  let code = '';
  do {
    code = `FR-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  } while (used.has(code));
  return code;
}

function inferTopDrop(
  user: UserProfile,
  items: ItemCard[],
  history: UpgradeHistoryEntry[],
  transactions: Transaction[]
): ItemCard | null {
  const wonIds = new Set([
    ...(user.inventory ?? []).filter((entry) => entry.source === 'case' || entry.source === 'upgrade').map((entry) => entry.itemId),
    ...history.filter((entry) => entry.userId === user.id && entry.won).map((entry) => entry.targetItemId),
  ]);
  const namesFromCases = transactions
    .filter((tx) => tx.userId === user.id && tx.type === 'case_open' && tx.meta?.startsWith('Выпал: '))
    .map((tx) => tx.meta!.slice('Выпал: '.length));
  for (const item of items) if (namesFromCases.includes(item.name)) wonIds.add(item.id);
  return items.filter((item) => wonIds.has(item.id)).sort((a, b) => b.price - a.price)[0] ?? null;
}

function inferUnlockedItemIds(
  user: Partial<UserProfile>,
  items: ItemCard[],
  history: UpgradeHistoryEntry[],
  transactions: Transaction[],
  deprecatedIds: Set<string> = new Set()
): string[] {
  const validIds = new Set(items.map((item) => item.id));
  const unlocked = new Set<string>();

  for (const id of Array.isArray(user.unlockedItemIds) ? user.unlockedItemIds : []) {
    if (validIds.has(id) && !deprecatedIds.has(id)) unlocked.add(id);
  }
  for (const inv of Array.isArray(user.inventory) ? user.inventory : []) {
    if (validIds.has(inv.itemId) && !deprecatedIds.has(inv.itemId)) unlocked.add(inv.itemId);
  }
  if (user.topDropItemId && validIds.has(user.topDropItemId) && !deprecatedIds.has(user.topDropItemId)) {
    unlocked.add(user.topDropItemId);
  }
  for (const entry of history) {
    if (entry.userId === user.id && entry.won && validIds.has(entry.targetItemId) && !deprecatedIds.has(entry.targetItemId)) {
      unlocked.add(entry.targetItemId);
    }
  }
  const namesFromCases = new Set(
    transactions
      .filter((tx) => tx.userId === user.id && tx.type === 'case_open' && tx.meta?.startsWith('Выпал: '))
      .map((tx) => tx.meta!.slice('Выпал: '.length))
  );
  for (const item of items) {
    if (namesFromCases.has(item.name) && !deprecatedIds.has(item.id)) {
      unlocked.add(item.id);
    }
  }
  return [...unlocked];
}

function grantCardDiscovery(user: UserProfile, itemId: string): number {
  user.unlockedItemIds = Array.isArray(user.unlockedItemIds) ? user.unlockedItemIds : [];
  user.xp = Math.max(0, Math.round(Number(user.xp) || 0));
  if (user.unlockedItemIds.includes(itemId)) return 0;

  const item = db.items.find((candidate) => candidate.id === itemId);
  if (!item) return 0;

  user.unlockedItemIds.push(itemId);
  const gained = getCardDiscoveryXp(item);
  user.xp += gained;
  return gained;
}

function syncUserAchievements(
  user: UserProfile,
  items: ItemCard[] = db.items,
  history: UpgradeHistoryEntry[] = db.upgradeHistory,
  transactions: Transaction[] = db.transactions,
  battles: PersistedBattleRoom[] = db.battles
): AchievementId[] {
  const battleWinsFromRooms = battles.filter(
    (room) => room.status === 'completed' && room.winnerUserId === user.id
  ).length;
  user.achievementStats = computeMergedAchievementStats(
    user,
    items,
    history,
    transactions,
    battleWinsFromRooms
  );
  user.unlockedAchievementIds = Array.isArray(user.unlockedAchievementIds)
    ? [...new Set(user.unlockedAchievementIds)]
    : [];
  user.claimedAchievementIds = Array.isArray(user.claimedAchievementIds)
    ? [...new Set(user.claimedAchievementIds)]
    : [];

  const before = new Set(user.unlockedAchievementIds);
  const progressList = evaluateAchievements(user, items);
  const newlyUnlocked: AchievementId[] = [];
  for (const entry of progressList) {
    if (entry.unlocked && !before.has(entry.id)) {
      user.unlockedAchievementIds.push(entry.id);
      before.add(entry.id);
      newlyUnlocked.push(entry.id);
    }
  }
  return newlyUnlocked;
}

function consumeTelegramHash(hash: string): boolean {
  const now = Date.now();
  db.consumedTelegramHashes = (db.consumedTelegramHashes ?? [])
    .filter((entry) => entry.expiresAt > now);
  if (db.consumedTelegramHashes.some((entry) => entry.hash === hash)) return false;
  db.consumedTelegramHashes.push({ hash, expiresAt: now + 10 * 60 * 1000 });
  if (db.consumedTelegramHashes.length > 5000) {
    db.consumedTelegramHashes.splice(0, db.consumedTelegramHashes.length - 5000);
  }
  return true;
}

function createInitialDb(): DatabaseSchema {
  const now = Date.now();

  const items: ItemCard[] = [
    {
      id: 'card_artemiy_daun',
      name: 'Артемий Даун',
      rarity: 'rare',
      collection: 'Даун',
      price: 230,
      imageUrl: '/assets/cards/artemiy_daun.png',
      createdAt: now - 86400000 * 6,
    },
    {
      id: 'card_michael_pizdyuk',
      name: 'Майкл Пиздюк',
      rarity: 'rare',
      collection: 'Майкл',
      price: 320,
      imageUrl: '/assets/cards/michael_pizdyuk.png',
      createdAt: now - 86400000 * 5.5,
    },
    {
      id: 'card_hustler_artemiy',
      name: 'Хастлер Артемий',
      rarity: 'rare',
      collection: 'Артемий',
      price: 410,
      imageUrl: '/assets/cards/hustler_artemiy.png',
      createdAt: now - 86400000 * 5,
    },
    {
      id: 'card_spy_michael',
      name: 'Шпион Майкл',
      rarity: 'super_rare',
      collection: 'Майкл',
      price: 840,
      imageUrl: '/assets/cards/spy_michael.png',
      createdAt: now - 86400000 * 4.5,
    },
    {
      id: 'card_down_timur',
      name: 'Даун Тимур',
      rarity: 'epic',
      collection: 'Даун',
      price: 1600,
      imageUrl: '/assets/cards/down_timur.png',
      createdAt: now - 86400000 * 4,
    },
    {
      id: 'card_drunk_artemiy',
      name: 'Бухой Артемий',
      rarity: 'epic',
      collection: 'Артемий',
      price: 1800,
      imageUrl: '/assets/cards/drunk_artemiy.png',
      createdAt: now - 86400000 * 3.5,
    },
    {
      id: 'card_kiri_chan',
      name: 'Кири-тян',
      rarity: 'epic',
      collection: 'Кирилл',
      price: 2000,
      imageUrl: '/assets/cards/kiri_chan.png',
      createdAt: now - 86400000 * 3,
    },
    {
      id: 'card_class_4b',
      name: '4Б',
      rarity: 'epic',
      collection: 'Сквад',
      price: 2200,
      imageUrl: '/assets/cards/class_4b.png',
      createdAt: now - 86400000 * 2.75,
    },
    {
      id: 'card_hunchback_timur',
      name: 'Горбатый Тимур',
      rarity: 'epic',
      collection: 'Тимур',
      price: 2400,
      imageUrl: '/assets/cards/hunchback_timur.png',
      createdAt: now - 86400000 * 2.5,
    },
    {
      id: 'card_usaty_vanya',
      name: 'Усатый Ваня',
      rarity: 'epic',
      collection: 'Ваня',
      price: 2850,
      imageUrl: '/assets/cards/usaty_vanya.png',
      createdAt: now - 86400000 * 2,
    },
    {
      id: 'card_eblany',
      name: 'Ебланы',
      rarity: 'epic',
      collection: 'Сквад',
      price: 3100,
      imageUrl: '/assets/cards/eblany.png',
      createdAt: now - 86400000 * 1.5,
    },
    {
      id: 'card_jopa_michaela',
      name: 'Жопа Майкла',
      rarity: 'epic',
      collection: 'Майкл',
      price: 3600,
      imageUrl: '/assets/cards/jopa_michaela.png',
      createdAt: now - 86400000 * 1,
    },
    {
      id: 'card_photographer_timur',
      name: 'Фотограф Тимур',
      rarity: 'legendary',
      collection: 'Тимур',
      price: 5500,
      imageUrl: '/assets/cards/photographer_timur.png',
      createdAt: now - 3600000 * 21,
    },
    {
      id: 'card_timur_volga',
      name: 'Тимур на Волге',
      rarity: 'legendary',
      collection: 'Тимур',
      price: 6400,
      imageUrl: '/assets/cards/timur_volga.png',
      createdAt: now - 3600000 * 18,
    },
    {
      id: 'card_crazy_artemiy',
      name: 'Сумасшедший Артемий',
      rarity: 'legendary',
      collection: 'Артемий',
      price: 8800,
      imageUrl: '/assets/cards/crazy_artemiy.png',
      createdAt: now - 3600000 * 15,
    },
    {
      id: 'card_vanya_dripchik',
      name: 'Ваня Дрипчик',
      rarity: 'legendary',
      collection: 'Ваня',
      price: 10500,
      imageUrl: '/assets/cards/vanya_dripchik.png',
      createdAt: now - 3600000 * 12,
    },
    {
      id: 'card_tenet_t4',
      name: 'TENET T4',
      rarity: 'legendary',
      collection: 'Сквад',
      price: 15000,
      imageUrl: '/assets/cards/tenet_t4.png',
      createdAt: now - 3600000 * 6,
    },
    {
      id: 'card_timur_derevenshchina',
      name: 'Тимур Деревенщина',
      rarity: 'rare',
      collection: 'Тимур',
      price: 200,
      imageUrl: '/assets/cards/timur_derevenshchina.png',
      createdAt: now - 3600000 * 5.8,
    },
    {
      id: 'card_fat_kirill',
      name: 'Толстый Кирилл',
      rarity: 'rare',
      collection: 'Кирилл',
      price: 260,
      imageUrl: '/assets/cards/fat_kirill.png',
      createdAt: now - 3600000 * 5.6,
    },
    {
      id: 'card_timur_snack',
      name: 'Перекус Тимура',
      rarity: 'rare',
      collection: 'Тимур',
      price: 290,
      imageUrl: '/assets/cards/timur_snack.png',
      createdAt: now - 3600000 * 5.4,
    },
    {
      id: 'card_kirill_shorts',
      name: 'Трусы Кирилла',
      rarity: 'rare',
      collection: 'Кирилл',
      price: 350,
      imageUrl: '/assets/cards/kirill_shorts.png',
      createdAt: now - 3600000 * 5.2,
    },
    {
      id: 'card_campfire_talk',
      name: 'Беседа у Костра',
      rarity: 'rare',
      collection: 'Сквад',
      price: 380,
      imageUrl: '/assets/cards/campfire_talk.png',
      createdAt: now - 3600000 * 5.0,
    },
    {
      id: 'card_ahegao_artemiy',
      name: 'Ахегао Артемий',
      rarity: 'rare',
      collection: 'Артемий',
      price: 440,
      imageUrl: '/assets/cards/ahegao_artemiy.png',
      createdAt: now - 3600000 * 4.8,
    },
    {
      id: 'card_schumachers',
      name: 'Шумахеры',
      rarity: 'rare',
      collection: 'Сквад',
      price: 480,
      imageUrl: '/assets/cards/schumachers.png',
      createdAt: now - 3600000 * 4.6,
    },
    {
      id: 'card_timur_ai',
      name: 'Тимур AI',
      rarity: 'super_rare',
      collection: 'Тимур',
      price: 650,
      imageUrl: '/assets/cards/timur_ai.png',
      createdAt: now - 3600000 * 4.4,
    },
    {
      id: 'card_artemiy_derp',
      name: 'Артемий Дерп',
      rarity: 'super_rare',
      collection: 'Артемий',
      price: 740,
      imageUrl: '/assets/cards/artemiy_derp.png',
      createdAt: now - 3600000 * 4.2,
    },
    {
      id: 'card_emo_michael',
      name: 'Майкл Эмо',
      rarity: 'super_rare',
      collection: 'Майкл',
      price: 940,
      imageUrl: '/assets/cards/emo_michael.png',
      createdAt: now - 3600000 * 4.0,
    },
    {
      id: 'card_bro_kirill',
      name: 'Братан Кирилл',
      rarity: 'super_rare',
      collection: 'Кирилл',
      price: 1040,
      imageUrl: '/assets/cards/bro_kirill.png',
      createdAt: now - 3600000 * 3.8,
    },
    {
      id: 'card_farmer_timur',
      name: 'Фермер Тимур',
      rarity: 'super_rare',
      collection: 'Тимур',
      price: 1140,
      imageUrl: '/assets/cards/farmer_timur.png',
      createdAt: now - 3600000 * 3.6,
    },
    {
      id: 'card_ptu_ninja',
      name: 'Ниндзя Скрытого ПТУ',
      rarity: 'super_rare',
      collection: 'Кирилл',
      price: 1250,
      imageUrl: '/assets/cards/ptu_ninja.png',
      createdAt: now - 3600000 * 3.4,
    },
    {
      id: 'card_crazy_vanya',
      name: 'Сумасшедший Ваня',
      rarity: 'epic',
      collection: 'Ваня',
      price: 2650,
      imageUrl: '/assets/cards/crazy_vanya.png',
      createdAt: now - 3600000 * 3.2,
    },
    {
      id: 'card_moscow_adventure',
      name: 'Московская Авантюра',
      rarity: 'epic',
      collection: 'Сквад',
      price: 3350,
      imageUrl: '/assets/cards/moscow_adventure.png',
      createdAt: now - 3600000 * 3.0,
    },
    {
      id: 'card_timur_svo',
      name: 'Тимур СВО',
      rarity: 'legendary',
      collection: 'Тимур',
      price: 7500,
      imageUrl: '/assets/cards/timur_svo.png',
      createdAt: now - 3600000 * 2.8,
    },
    {
      id: 'card_alpha_timur',
      name: 'Альфа Тимур',
      rarity: 'legendary',
      collection: 'Тимур',
      price: 12500,
      imageUrl: '/assets/cards/alpha_timur.png',
      createdAt: now - 3600000 * 2.6,
    },
  ];

  const cases: CaseBox[] = [
    {
      id: 'case_starter',
      name: 'Зелёный Старт',
      description: 'Входной кейс со всей редкой десяткой сквада и шансом выбить сверхредкую или стартовую эпическую карту.',
      price: 650,
      tier: 'rare',
      imageUrl: '/assets/cases/case_starter.png',
      itemIds: [
        'card_timur_derevenshchina',
        'card_artemiy_daun',
        'card_fat_kirill',
        'card_timur_snack',
        'card_michael_pizdyuk',
        'card_kirill_shorts',
        'card_campfire_talk',
        'card_hustler_artemiy',
        'card_ahegao_artemiy',
        'card_schumachers',
        'card_timur_ai',
        'card_artemiy_derp',
        'card_spy_michael',
        'card_down_timur',
      ],
      rarityWeights: { common: 0, rare: 68, super_rare: 24, epic: 8, legendary: 0 },
    },
    {
      id: 'case_spy_cobalt',
      name: 'Кобальт ПТУ',
      description: 'Синий кейс со всей семёркой сверхредких карт, редкой основой и четверкой сочных эпиков.',
      price: 1300,
      tier: 'super_rare',
      imageUrl: '/assets/cases/case_spy_cobalt.png',
      itemIds: [
        'card_michael_pizdyuk',
        'card_kirill_shorts',
        'card_campfire_talk',
        'card_hustler_artemiy',
        'card_schumachers',
        'card_timur_ai',
        'card_artemiy_derp',
        'card_spy_michael',
        'card_emo_michael',
        'card_bro_kirill',
        'card_farmer_timur',
        'card_ptu_ninja',
        'card_down_timur',
        'card_drunk_artemiy',
        'card_kiri_chan',
        'card_class_4b',
      ],
      rarityWeights: { common: 0, rare: 42, super_rare: 38, epic: 20, legendary: 0 },
    },
    {
      id: 'case_cosmos',
      name: 'Космос Сквад',
      description: 'Сбалансированный кейс с Московской Авантюрой, топ-эпиками и шансом поймать Фотографа или Тимура на Волге.',
      price: 2150,
      tier: 'epic',
      imageUrl: '/assets/cases/case_cosmos.png',
      itemIds: [
        'card_timur_derevenshchina',
        'card_artemiy_daun',
        'card_fat_kirill',
        'card_timur_snack',
        'card_ahegao_artemiy',
        'card_spy_michael',
        'card_emo_michael',
        'card_bro_kirill',
        'card_farmer_timur',
        'card_ptu_ninja',
        'card_class_4b',
        'card_hunchback_timur',
        'card_crazy_vanya',
        'card_usaty_vanya',
        'card_eblany',
        'card_moscow_adventure',
        'card_photographer_timur',
        'card_timur_volga',
      ],
      rarityWeights: { common: 0, rare: 34, super_rare: 30, epic: 26, legendary: 10 },
    },
    {
      id: 'case_drip_legend',
      name: 'Дрип Легенд',
      description: 'Премиальный золотой кейс с 7 эпическими картами и охотой за Тимуром СВО, Сумасшедшим Артемием и легендами Тимура.',
      price: 2950,
      tier: 'legendary',
      imageUrl: '/assets/cases/case_drip_legend.png',
      itemIds: [
        'card_hustler_artemiy',
        'card_ahegao_artemiy',
        'card_schumachers',
        'card_emo_michael',
        'card_bro_kirill',
        'card_farmer_timur',
        'card_ptu_ninja',
        'card_drunk_artemiy',
        'card_kiri_chan',
        'card_hunchback_timur',
        'card_crazy_vanya',
        'card_usaty_vanya',
        'card_eblany',
        'card_jopa_michaela',
        'card_photographer_timur',
        'card_timur_volga',
        'card_timur_svo',
        'card_crazy_artemiy',
      ],
      rarityWeights: { common: 0, rare: 28, super_rare: 28, epic: 28, legendary: 16 },
    },
    {
      id: 'case_tenet_vip',
      name: 'TENET Автосалон VIP',
      description: 'Флагманский VIP-кейс со всеми 7 золотыми легендами, включая Ваню Дрипчика, Альфа Тимура и TENET T4.',
      price: 4100,
      tier: 'legendary',
      imageUrl: '/assets/cases/case_tenet_vip.png',
      itemIds: [
        'card_campfire_talk',
        'card_schumachers',
        'card_bro_kirill',
        'card_farmer_timur',
        'card_ptu_ninja',
        'card_hunchback_timur',
        'card_crazy_vanya',
        'card_usaty_vanya',
        'card_eblany',
        'card_moscow_adventure',
        'card_jopa_michaela',
        'card_photographer_timur',
        'card_timur_volga',
        'card_timur_svo',
        'card_crazy_artemiy',
        'card_vanya_dripchik',
        'card_alpha_timur',
        'card_tenet_t4',
      ],
      rarityWeights: { common: 0, rare: 26, super_rare: 26, epic: 28, legendary: 20 },
    },
  ];

  // Derive opening prices from the published drop table: every case targets the same
  // theoretical 75% return before randomness, instead of unrelated hard-coded prices.
  for (const caseBox of cases) {
    const caseItems = caseBox.itemIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is ItemCard => Boolean(item));
    caseBox.price = recommendedCasePrice(calculateCaseExpectedValue(caseBox, caseItems));
  }

  const defaultUser: UserProfile = {
    id: 'user_playerone',
    username: 'PlayerOne',
    telegramId: '700100201',
    telegramUsername: 'playerone_tg',
    telegramFirstName: 'PlayerOne',
    avatarColor: '#F59E0B',
    balance: 1500,
    referralCode: 'CARDUP-P177',
    friendCode: 'FR-PLAYERONE',
    friends: ['user_vanya_fan'],
    topDropItemId: 'card_down_timur',
    topDropPrice: 1500,
    referredByCode: null,
    referralCount: 2,
    referralEarned: 340,
    dailyStreak: 0,
    lastDailyClaimAt: null,
    totalDeposited: 1500,
    totalUpgrades: 2,
    wonUpgrades: 1,
    totalCasesOpened: 1,
    xp: 350,
    unlockedItemIds: ['card_artemiy_daun', 'card_hustler_artemiy', 'card_down_timur'],
    claimedCollectionRewards: [],
    equippedBadgeCollection: null,
    showcaseItemIds: [],
    unlockedAchievementIds: [],
    claimedAchievementIds: [],
    achievementStats: createEmptyAchievementStats(),
    inventory: [
      { instanceId: 'inv_seed_1', itemId: 'card_artemiy_daun', acquiredAt: now - 3600000 * 5, source: 'starter' },
      { instanceId: 'inv_seed_2', itemId: 'card_hustler_artemiy', acquiredAt: now - 3600000 * 4, source: 'starter' },
      { instanceId: 'inv_seed_3', itemId: 'card_down_timur', acquiredAt: now - 3600000 * 3, source: 'case' },
    ],
    createdAt: now - 86400000 * 3,
  };

  const friendUser: UserProfile = {
    id: 'user_vanya_fan',
    username: 'DripMaster',
    avatarColor: '#A855F7',
    balance: 3200,
    referralCode: 'DRIP-MASTER',
    friendCode: 'FR-DRIPMASTER',
    friends: ['user_playerone'],
    topDropItemId: 'card_usaty_vanya',
    topDropPrice: 2400,
    referredByCode: 'CARDUP-P177',
    referralCount: 0,
    referralEarned: 0,
    dailyStreak: 2,
    lastDailyClaimAt: now - 3600000 * 30,
    totalDeposited: 2500,
    totalUpgrades: 4,
    wonUpgrades: 2,
    totalCasesOpened: 3,
    xp: 250,
    unlockedItemIds: ['card_usaty_vanya'],
    claimedCollectionRewards: [],
    equippedBadgeCollection: null,
    showcaseItemIds: [],
    unlockedAchievementIds: [],
    claimedAchievementIds: [],
    achievementStats: createEmptyAchievementStats(),
    inventory: [
      { instanceId: 'inv_seed_4', itemId: 'card_usaty_vanya', acquiredAt: now - 3600000 * 2, source: 'upgrade' },
    ],
    createdAt: now - 86400000 * 2,
  };

  const transactions: Transaction[] = [
    {
      id: uid('tx'),
      userId: defaultUser.id,
      type: 'deposit',
      amount: 1500,
      balanceAfter: 1500,
      description: 'Стартовый депозит (Т-Банк Дрип-Пэй)',
      meta: 'PROMO: START',
      createdAt: now - 3600000 * 6,
    },
    {
      id: uid('tx'),
      userId: defaultUser.id,
      type: 'referral_commission',
      amount: 190,
      balanceAfter: 1690,
      description: 'Реферальный бонус 5% от DripMaster',
      createdAt: now - 3600000 * 3,
    },
  ];

  const upgradeHistory: UpgradeHistoryEntry[] = [
    {
      id: uid('upg'),
      userId: defaultUser.id,
      stakeItemIds: ['card_hustler_artemiy'],
      stakeBalanceAdded: 170,
      stakeTotal: 750,
      targetItemId: 'card_down_timur',
      targetPrice: 1500,
      winChance: 47.5,
      multiplier: 2,
      rollMode: 'under',
      rollValue: 18.42,
      won: true,
      createdAt: now - 3600000 * 3,
    },
  ];

  const liveDrops: LiveDropEntry[] = [
    { id: uid('drop'), userName: 'DripMaster', itemId: 'card_tenet_t4', source: 'case', createdAt: now - 180000 },
    { id: uid('drop'), userName: 'PlayerOne', itemId: 'card_down_timur', source: 'upgrade', multiplier: 2.0, createdAt: now - 420000 },
    { id: uid('drop'), userName: 'KiberFox', itemId: 'card_vanya_dripchik', source: 'upgrade', multiplier: 3.1, createdAt: now - 720000 },
    { id: uid('drop'), userName: 'Sniper77', itemId: 'card_timur_volga', source: 'case', createdAt: now - 960000 },
    { id: uid('drop'), userName: 'AlexTC', itemId: 'card_kiri_chan', source: 'upgrade', multiplier: 1.95, createdAt: now - 1400000 },
  ];

  return {
    items,
    cases,
    // New databases start clean. Demo identities/drops must never be presented as real players.
    users: [],
    transactions: [],
    upgradeHistory: [],
    liveDrops: [],
    friendRequests: [],
    battleInvitations: [],
    battles: [],
    minigameSessions: [],
    catalogVersion: 8,
    economyVersion: 5,
  };
}

function loadDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw) as DatabaseSchema;
  } catch {
    const fallback = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

const localDbExistedAtBoot = fs.existsSync(DB_PATH);
let db: DatabaseSchema = loadDb();
let postgresPool: Pool | null = null;

function saveDb() {
  if (postgresPool) return; // PostgreSQL writes are committed by the request transaction middleware.
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

function normalizeStoredDb(value: unknown): DatabaseSchema {
  const parsed = value as Partial<DatabaseSchema>;
  const seed = createInitialDb();
  const existingUsers = Array.isArray(parsed.users) ? parsed.users.filter((user) =>
    user.id !== 'user_playerone' && user.id !== 'user_vanya_fan'
  ) : [];
  const usedFriendCodes = new Set<string>();
  const loadedTransactions = Array.isArray(parsed.transactions) ? parsed.transactions.filter((tx) =>
    tx.userId !== 'user_playerone' && tx.userId !== 'user_vanya_fan'
  ) : [];
  const loadedUpgradeHistory = Array.isArray(parsed.upgradeHistory) ? parsed.upgradeHistory.filter((entry) =>
    entry.userId !== 'user_playerone' && entry.userId !== 'user_vanya_fan'
  ) : [];
  const activeItems = Array.isArray(parsed.items) ? parsed.items : seed.items;
  const normalizedUsers = existingUsers.map((user) => {
    let friendCode = user.friendCode?.toUpperCase();
    if (!friendCode || usedFriendCodes.has(friendCode)) friendCode = createFriendCode([...existingUsers]);
    usedFriendCodes.add(friendCode);
    const topDrop = inferTopDrop(user, activeItems, loadedUpgradeHistory, loadedTransactions);
    const unlockedIds = inferUnlockedItemIds(user, activeItems, loadedUpgradeHistory, loadedTransactions);
    const itemsById = new Map(activeItems.map((it) => [it.id, it]));
    const minXpFromUnlocked = unlockedIds.reduce(
      (sum, id) => sum + getCardDiscoveryXp(itemsById.get(id)),
      0
    );
    const unlockedSet = new Set(unlockedIds);
    const claimedCollectionRewards = Array.isArray(user.claimedCollectionRewards)
      ? [...new Set(user.claimedCollectionRewards.filter((c) => typeof c === 'string' && c.trim().length > 0))]
      : [];
    const showcaseItemIds = Array.isArray(user.showcaseItemIds)
      ? [...new Set(user.showcaseItemIds.filter((id) => unlockedSet.has(id)))].slice(0, 3)
      : [];
    const equippedBadgeCollection = typeof user.equippedBadgeCollection === 'string' && user.equippedBadgeCollection.trim()
      ? user.equippedBadgeCollection.trim()
      : null;
    const normalizedUser: UserProfile = {
      ...user,
      friendCode,
      friends: Array.isArray(user.friends) ? user.friends : [],
      topDropItemId: user.topDropItemId || topDrop?.id || null,
      topDropPrice: Math.max(Number(user.topDropPrice) || 0, topDrop?.price ?? 0),
      unlockedItemIds: unlockedIds,
      claimedCollectionRewards,
      equippedBadgeCollection,
      showcaseItemIds,
      unlockedAchievementIds: Array.isArray(user.unlockedAchievementIds) ? user.unlockedAchievementIds : [],
      claimedAchievementIds: Array.isArray(user.claimedAchievementIds) ? user.claimedAchievementIds : [],
      achievementStats: user.achievementStats ?? createEmptyAchievementStats(),
      xp: Math.max(Math.round(Number(user.xp) || 0), minXpFromUnlocked),
    };
    syncUserAchievements(
      normalizedUser,
      activeItems,
      loadedUpgradeHistory,
      loadedTransactions,
      Array.isArray(parsed.battles) ? parsed.battles : []
    );
    return normalizedUser;
  });
  const normalized: DatabaseSchema = {
    ...seed,
    ...parsed,
    items: Array.isArray(parsed.items) ? parsed.items : seed.items,
    cases: Array.isArray(parsed.cases) ? parsed.cases : seed.cases,
    // Remove identities that existed only to populate the old demo UI.
    users: normalizedUsers,
    transactions: loadedTransactions,
    upgradeHistory: loadedUpgradeHistory,
    liveDrops: Array.isArray(parsed.liveDrops) ? parsed.liveDrops.filter((drop) =>
      !['PlayerOne', 'DripMaster', 'KiberFox', 'Sniper77', 'AlexTC'].includes(drop.userName)
      && (parsed.items ?? seed.items).some((item) => item.id === drop.itemId && item.price >= 1000)
    ) : [],
    friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
    battleInvitations: Array.isArray(parsed.battleInvitations) ? parsed.battleInvitations : [],
    battles: Array.isArray(parsed.battles) ? parsed.battles : [],
    minigameSessions: Array.isArray(parsed.minigameSessions)
      ? parsed.minigameSessions.filter((s) => s && s.expiresAt > Date.now() - 3600_000).slice(-200)
      : [],
    consumedTelegramHashes: Array.isArray(parsed.consumedTelegramHashes) ? parsed.consumedTelegramHashes : [],
  };

  const DEPRECATED_DUPLICATE_IDS = new Set(['card_spy_michael_epic']);
  const DEPRECATED_SEED_CASE_IDS = new Set([
    'case_hustle',
    'case_ptu_kobalt',
    'case_alpha_timur',
    'case_custom_artemiy',
    'case_custom_timur',
    'case_custom_purple',
    'case_custom_vanya',
    'case_custom_oligarch',
  ]);

  if ((parsed.catalogVersion ?? 0) < 8) {
    const seedItemsById = new Map(seed.items.map((seedItem) => [seedItem.id, seedItem]));
    normalized.items = normalized.items
      .filter((item) => !DEPRECATED_DUPLICATE_IDS.has(item.id))
      .map((item) => {
        const seedMatch = seedItemsById.get(item.id);
        if (seedMatch) {
          return {
            ...item,
            name: seedMatch.name,
            rarity: seedMatch.rarity,
            collection: seedMatch.collection ?? inferCardCollection(seedMatch.name),
            price: seedMatch.price,
            imageUrl: seedMatch.imageUrl,
          };
        }
        return {
          ...item,
          collection: item.collection?.trim() || inferCardCollection(item.name),
        };
      });

    const existingItemIds = new Set(normalized.items.map((item) => item.id));
    for (const seedItem of seed.items) {
      if (!existingItemIds.has(seedItem.id)) {
        normalized.items.push(seedItem);
        existingItemIds.add(seedItem.id);
      }
    }

    const seedCasesById = new Map(seed.cases.map((seedCase) => [seedCase.id, seedCase]));
    normalized.cases = normalized.cases
      .filter((caseBox) => !DEPRECATED_SEED_CASE_IDS.has(caseBox.id) && !caseBox.id.startsWith('case_custom_'))
      .map((caseBox) => {
        const matchingSeed = seedCasesById.get(caseBox.id);
        if (matchingSeed) {
          return {
            ...matchingSeed,
            rarityWeights: { ...matchingSeed.rarityWeights },
          };
        }
        return {
          ...caseBox,
          itemIds: caseBox.itemIds.filter((id) => !DEPRECATED_DUPLICATE_IDS.has(id)),
        };
      });

    const existingCaseIds = new Set(normalized.cases.map((caseBox) => caseBox.id));
    for (const seedCase of seed.cases) {
      if (!existingCaseIds.has(seedCase.id)) {
        normalized.cases.push(seedCase);
        existingCaseIds.add(seedCase.id);
      }
    }
    const seedOrder = new Map(seed.cases.map((c, idx) => [c.id, idx]));
    normalized.cases.sort((a, b) => (seedOrder.get(a.id) ?? 999) - (seedOrder.get(b.id) ?? 999));

    normalized.users = normalized.users.map((user) => {
      const cleanedInventory = user.inventory.filter((inv) => !DEPRECATED_DUPLICATE_IDS.has(inv.itemId));
      const needsTopDropRecompute = user.topDropItemId && DEPRECATED_DUPLICATE_IDS.has(user.topDropItemId);
      const nextTopDrop = needsTopDropRecompute
        ? inferTopDrop({ ...user, inventory: cleanedInventory }, normalized.items, normalized.upgradeHistory, normalized.transactions)
        : null;
      const unlockedIds = inferUnlockedItemIds(
        { ...user, inventory: cleanedInventory },
        normalized.items,
        normalized.upgradeHistory,
        normalized.transactions,
        DEPRECATED_DUPLICATE_IDS
      );
      const itemsById = new Map(normalized.items.map((it) => [it.id, it]));
      const minXp = unlockedIds.reduce((sum, id) => sum + getCardDiscoveryXp(itemsById.get(id)), 0);
      const unlockedSet = new Set(unlockedIds);
      const syncedUser: UserProfile = {
        ...user,
        inventory: cleanedInventory,
        unlockedItemIds: unlockedIds,
        claimedCollectionRewards: Array.isArray(user.claimedCollectionRewards) ? user.claimedCollectionRewards : [],
        equippedBadgeCollection: user.equippedBadgeCollection ?? null,
        showcaseItemIds: (Array.isArray(user.showcaseItemIds) ? user.showcaseItemIds : [])
          .filter((id) => unlockedSet.has(id) && !DEPRECATED_DUPLICATE_IDS.has(id))
          .slice(0, 3),
        xp: Math.max(Math.round(Number(user.xp) || 0), minXp),
        topDropItemId: needsTopDropRecompute ? (nextTopDrop?.id ?? null) : user.topDropItemId,
        topDropPrice: needsTopDropRecompute ? (nextTopDrop?.price ?? 0) : user.topDropPrice,
      };
      syncUserAchievements(
        syncedUser,
        normalized.items,
        normalized.upgradeHistory,
        normalized.transactions,
        normalized.battles
      );
      return syncedUser;
    });

    normalized.liveDrops = normalized.liveDrops.filter((drop) => !DEPRECATED_DUPLICATE_IDS.has(drop.itemId));
    normalized.upgradeHistory = normalized.upgradeHistory.filter((entry) => !DEPRECATED_DUPLICATE_IDS.has(entry.targetItemId));
    normalized.catalogVersion = 8;
    normalized.economyVersion = 5;
  } else {
    normalized.items = normalized.items.map((item) => ({
      ...item,
      collection: item.collection?.trim() || inferCardCollection(item.name),
    }));
  }

  if ((parsed.economyVersion ?? 0) < 5 || (parsed.catalogVersion ?? 0) < 8) {
    for (const caseBox of normalized.cases) {
      const caseItems = caseBox.itemIds
        .map((id) => normalized.items.find((item) => item.id === id))
        .filter((item): item is ItemCard => Boolean(item));
      const fairPrice = recommendedCasePrice(calculateCaseExpectedValue(caseBox, caseItems));
      if (fairPrice > 0) caseBox.price = fairPrice;
    }
    normalized.economyVersion = 5;
  }
  return normalized;
}

db = normalizeStoredDb(db);

async function initializePostgres(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production. Attach a persistent PostgreSQL database in Render.');
    }
    return;
  }

  postgresPool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DB_POOL_SIZE) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS cardup_state (
      id smallint PRIMARY KEY CHECK (id = 1),
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [710241, 1]);
    const result = await client.query<{ data: DatabaseSchema }>('SELECT data FROM cardup_state WHERE id = 1 FOR UPDATE');
    if (result.rowCount) {
      db = normalizeStoredDb(result.rows[0].data);
    } else {
      // Import the existing JSON file once when it is present on the old Render instance.
      // If it is absent (ephemeral disk already reset), initialize a clean catalog instead.
      const source = localDbExistedAtBoot ? db : createInitialDb();
      db = normalizeStoredDb(source);
    }
    if (db.authVersion !== 2) {
      db.sessionSecret = crypto.randomBytes(32).toString('hex');
      db.revokedTokens = [];
      db.authVersion = 2;
      for (const user of db.users) {
        if ((user.authProvider as string | undefined) === 'preview') delete user.authProvider;
      }
    }
    await client.query(
      `INSERT INTO cardup_state (id, data) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(db)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Refreshes shared state for every request and serializes writes across Render instances.
 * The database transaction commits before a mutation response is sent to the browser.
 */
function usePostgresState(app: express.Express): void {
  if (!postgresPool) return;
  app.use('/api', async (req, res, next) => {
    let client: PoolClient | undefined;
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    try {
      client = await postgresPool!.connect();
      if (isWrite) {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [710241, 1]);
      }
      const result = await client.query<{ data: DatabaseSchema }>('SELECT data FROM cardup_state WHERE id = 1');
      if (!result.rowCount) throw new Error('Persistent database is missing its initialized state row.');
      db = result.rows[0].data;

      if (!isWrite) {
        client.release();
        client = undefined;
        next();
        return;
      }

      const originalJson = res.json.bind(res);
      let completed = false;
      res.json = ((body: unknown) => {
        if (completed) return res;
        completed = true;
        const snapshot = JSON.stringify(db);
        void (async () => {
          try {
            await client!.query('UPDATE cardup_state SET data = $1::jsonb, updated_at = now() WHERE id = 1', [snapshot]);
            await client!.query('COMMIT');
            client!.release();
            client = undefined;
            originalJson(body);
          } catch (error) {
            if (client) {
              await client.query('ROLLBACK').catch(() => undefined);
              client.release();
              client = undefined;
            }
            console.error('PostgreSQL transaction failed:', error);
            if (!res.headersSent) res.status(503).send('Не удалось сохранить изменения. Повторите запрос.');
          }
        })();
        return res;
      }) as express.Response['json'];

      res.once('close', () => {
        if (client && !completed) {
          if (isWrite) void client.query('ROLLBACK').finally(() => client?.release());
          else client.release();
          client = undefined;
        }
      });
      next();
    } catch (error) {
      if (client) {
        if (isWrite) await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
      next(error);
    }
  });
}

// Invalidate any sessions minted by the old demo username/register endpoints.
if (db.authVersion !== 2) {
  db.sessionSecret = crypto.randomBytes(32).toString('hex');
  db.revokedTokens = [];
  db.authVersion = 2;
  for (const user of db.users) {
    if ((user.authProvider as string | undefined) === 'preview') delete user.authProvider;
  }
  saveDb();
}
// Persist one-time data-shape additions such as friend codes during local development.
saveDb();

function getUser(userId?: string): UserProfile {
  if (userId) {
    const found = db.users.find((u) => u.id === userId);
    if (found) return found;
  }
  return db.users[0];
}

function recordTx(
  user: UserProfile,
  type: Transaction['type'],
  amount: number,
  description: string,
  meta?: string
): Transaction {
  const tx: Transaction = {
    id: uid('tx'),
    userId: user.id,
    type,
    amount: Math.round(amount),
    balanceAfter: Math.round(user.balance),
    description,
    meta,
    createdAt: Date.now(),
  };
  db.transactions.unshift(tx);
  return tx;
}

function pushLiveDrop(userName: string, itemId: string, source: 'upgrade' | 'case' | 'contract', multiplier?: number) {
  const item = db.items.find((candidate) => candidate.id === itemId);
  if (!item || item.price < 1000) return;
  db.liveDrops.unshift({
    id: uid('drop'),
    userName,
    itemId,
    source,
    multiplier,
    createdAt: Date.now(),
  });
  if (db.liveDrops.length > 100) {
    db.liveDrops = db.liveDrops.slice(0, 100);
  }
}

function noteTopDrop(user: UserProfile, item: ItemCard): void {
  if (item.price > user.topDropPrice) {
    user.topDropItemId = item.id;
    user.topDropPrice = item.price;
  }
}

function sendRealtimeToUser(userId: string, event: Record<string, unknown>): void {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return;
  const message = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

function sendRealtimeToBattle(room: PersistedBattleRoom, event: Record<string, unknown>): void {
  sendRealtimeToUser(room.hostUserId, event);
  if (room.guestUserId) sendRealtimeToUser(room.guestUserId, event);
}

function publicBattle(room: PersistedBattleRoom, viewerUserId?: string): BattleRoomSummary {
  const isParticipant = viewerUserId === room.hostUserId || viewerUserId === room.guestUserId;
  return {
    id: room.id,
    mode: room.mode,
    status: room.status,
    hostUserId: room.hostUserId,
    hostUsername: room.hostUsername,
    hostAvatarUrl: isParticipant ? db.users.find((entry) => entry.id === room.hostUserId)?.telegramPhotoUrl : undefined,
    hostAvatarColor: isParticipant ? db.users.find((entry) => entry.id === room.hostUserId)?.avatarColor : undefined,
    guestUserId: room.guestUserId,
    guestUsername: room.guestUsername,
    guestAvatarUrl: isParticipant && room.guestUserId ? db.users.find((entry) => entry.id === room.guestUserId)?.telegramPhotoUrl : undefined,
    guestAvatarColor: isParticipant && room.guestUserId ? db.users.find((entry) => entry.id === room.guestUserId)?.avatarColor : undefined,
    hasPassword: room.hasPassword,
    caseId: room.caseId,
    caseName: room.caseName,
    caseCount: room.caseCount,
    hostStakeValue: room.hostStakeValue,
    guestStakeValue: room.guestStakeValue,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    durationMs: room.durationMs,
    winnerUserId: isParticipant ? room.winnerUserId : undefined,
    hostWinChance: isParticipant ? room.hostWinChance : undefined,
    rollValue: isParticipant ? room.rollValue : undefined,
    roundResults: isParticipant ? room.roundResults : undefined,
    rewardInventoryIds: isParticipant
      ? room.awardedInventoryIdsByUser?.[viewerUserId!]
        ?? (viewerUserId === room.winnerUserId ? room.awardedInventoryIds : undefined)
      : undefined,
    hostItems: isParticipant ? room.hostItems : undefined,
    guestItems: isParticipant ? room.guestItems : undefined,
  };
}

function getSessionSecret(): string {
  if (!db.sessionSecret) {
    db.sessionSecret = crypto.randomBytes(32).toString('hex');
    saveDb();
  }
  return db.sessionSecret;
}

function issueSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      jti: crypto.randomBytes(8).toString('hex'),
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token?: string | null): string | null {
  if (!token || !token.includes('.')) return null;
  if (db.revokedTokens?.includes(token)) return null;
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  try {
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

function authenticatedUser(req: express.Request, res: express.Response): UserProfile | null {
  const userId = verifySessionToken(extractSessionCookie(req));
  const user = userId ? db.users.find((candidate) => candidate.id === userId) : undefined;
  if (!user) {
    res.status(401).json({ error: 'Войдите через Telegram, чтобы продолжить.' });
    return null;
  }
  return user;
}

function adminUser(req: express.Request, res: express.Response): UserProfile | null {
  const user = authenticatedUser(req, res);
  if (!user) return null;
  const adminIds = (process.env.TELEGRAM_ADMIN_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!user.telegramId || !adminIds.includes(user.telegramId)) {
    res.status(403).json({ error: 'Недостаточно прав.' });
    return null;
  }
  return user;
}

function isHttpsRequest(req: express.Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return req.secure || forwardedProto.includes('https') || process.env.NODE_ENV === 'production';
}

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const https = isHttpsRequest(req);
  res.cookie('cardup_tg_session', token, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

function extractSessionCookie(req: express.Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'cardup_tg_session') {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
}

function buildPayload(userId?: string, authenticated = Boolean(userId)): BootstrapPayload {
  const user = authenticated && userId ? getUser(userId) : {
    id: 'guest',
    username: 'Гость',
    avatarColor: '#2AABEE',
    balance: 0,
    referralCode: '',
    friendCode: '',
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
    achievementStats: createEmptyAchievementStats(),
    inventory: [],
    createdAt: Date.now(),
  } satisfies UserProfile;
  const friends: FriendSummary[] = authenticated
    ? user.friends
        .map((friendId) => db.users.find((candidate) => candidate.id === friendId))
        .filter((friend): friend is UserProfile => Boolean(friend))
        .map((friend) => ({
          id: friend.id,
          username: friend.username,
          telegramUsername: friend.telegramUsername,
          telegramPhotoUrl: friend.telegramPhotoUrl,
          avatarColor: friend.avatarColor,
          totalUpgrades: friend.totalUpgrades,
          wonUpgrades: friend.wonUpgrades,
          totalCasesOpened: friend.totalCasesOpened,
          topDropItemId: friend.topDropItemId,
          topDropPrice: friend.topDropPrice,
        }))
    : [];
  const friendRequestsReceived: FriendRequestSummary[] = authenticated
    ? db.friendRequests
        .filter((request) => request.toUserId === user.id)
        .map((request) => db.users.find((candidate) => candidate.id === request.fromUserId))
        .filter((sender): sender is UserProfile => Boolean(sender))
        .map((sender) => {
          const request = db.friendRequests.find((candidate) => candidate.toUserId === user.id && candidate.fromUserId === sender.id)!;
          return {
            id: request.id,
            fromUserId: sender.id,
            fromUsername: sender.username,
            fromTelegramUsername: sender.telegramUsername,
            fromPhotoUrl: sender.telegramPhotoUrl,
            createdAt: request.createdAt,
          };
        })
    : [];
  const battleInvitations: BattleInvitationSummary[] = authenticated
    ? db.battleInvitations
        .filter((invite) => invite.toUserId === user.id && invite.status === 'pending')
        .map((invite) => ({
          id: invite.id,
          roomId: invite.roomId,
          fromUsername: db.users.find((candidate) => candidate.id === invite.fromUserId)?.username ?? 'Игрок',
          mode: db.battles.find((battle) => battle.id === invite.roomId)?.mode ?? 'upgrade',
          caseId: db.battles.find((battle) => battle.id === invite.roomId)?.caseId,
          caseCount: db.battles.find((battle) => battle.id === invite.roomId)?.caseCount,
          createdAt: invite.createdAt,
        }))
    : [];
  return {
    user,
    users: authenticated ? [{
      id: user.id,
      username: user.username,
      telegramUsername: user.telegramUsername,
      balance: user.balance,
      referralCode: user.referralCode,
    }] : [],
    items: db.items,
    cases: db.cases,
    transactions: authenticated ? db.transactions.filter((t) => t.userId === user.id).slice(0, 60) : [],
    upgradeHistory: authenticated ? db.upgradeHistory.filter((h) => h.userId === user.id).slice(0, 40) : [],
    liveDrops: db.liveDrops.slice(0, 50),
    friends,
    friendRequestsReceived,
    battleInvitations,
    minigames: getMinigameStatusMap(authenticated ? user : undefined),
    authenticated,
  };
}

function verifyTelegramLoginWidget(
  data: Record<string, unknown>,
  botToken: string
): { valid: boolean; reason?: string } {
  const hash = typeof data.hash === 'string' ? data.hash : '';
  const authDate = Number(data.auth_date ?? 0);
  if (!hash || !Number.isFinite(authDate) || authDate <= 0) {
    return { valid: false, reason: 'Отсутствует подпись или дата авторизации Telegram.' };
  }
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > 600 || ageSec < -60) {
    return { valid: false, reason: 'Срок действия подписи Telegram истёк.' };
  }

  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] !== undefined && data[k] !== null && data[k] !== '')
    .sort()
    .map((k) => `${k}=${String(data[k])}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  try {
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return { valid: false, reason: 'Неверная криптографическая подпись Telegram.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Ошибка проверки подписи Telegram.' };
  }
}

function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string
): {
  valid: boolean;
  user?: { id: number; username?: string; first_name?: string; photo_url?: string };
  reason?: string;
} {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash') ?? '';
    const authDate = Number(params.get('auth_date') ?? 0);
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    if (!hash || !Number.isFinite(authDate) || ageSec > 600 || ageSec < -60) {
      return { valid: false, reason: 'Некорректные или устаревшие данные Telegram Mini App.' };
    }

    const entries: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') entries.push(`${key}=${value}`);
    });
    entries.sort();
    const dataCheckString = entries.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return { valid: false, reason: 'Подпись Telegram WebApp не прошла проверку.' };
    }

    const userRaw = params.get('user');
    if (!userRaw) return { valid: false, reason: 'Нет данных пользователя в initData.' };
    const parsedUser = JSON.parse(userRaw) as {
      id: number;
      username?: string;
      first_name?: string;
      photo_url?: string;
    };
    if (!Number.isSafeInteger(parsedUser.id) || parsedUser.id <= 0) {
      return { valid: false, reason: 'Некорректный Telegram user ID.' };
    }
    return { valid: true, user: parsedUser };
  } catch {
    return { valid: false, reason: 'Ошибка разбора Telegram initData.' };
  }
}

function upsertTelegramUser(params: {
  telegramId?: string;
  username?: string;
  firstName?: string;
  photoUrl?: string;
  provider: UserProfile['authProvider'];
}): UserProfile {
  const tgId = params.telegramId?.trim();
  const cleanHandle = (params.username ?? '').replace(/^@+/, '').trim();
  const cleanDisplay = (params.firstName ?? cleanHandle ?? `TG_${tgId ?? 'User'}`).trim().slice(0, 24);
  const normalizedHandle = cleanHandle.toLowerCase();

  // Telegram numeric ID is the identity. Usernames can change or be recycled.
  let user = tgId ? db.users.find((candidate) => candidate.telegramId === tgId) : undefined;

  if (!user) {
    const palette = ['#2AABEE', '#F59E0B', '#10B981', '#A855F7', '#EC4899'];
    const handleBase = cleanHandle || cleanDisplay;
    const newCode = `TG-${handleBase.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'USR'}${Math.floor(10 + Math.random() * 89)}`;

    user = {
      id: uid('user'),
      username: cleanDisplay || cleanHandle || `User_${tgId}`,
      telegramId: tgId || uid('tg'),
      telegramUsername: cleanHandle || undefined,
      telegramFirstName: cleanDisplay || undefined,
      telegramPhotoUrl: params.photoUrl,
      authProvider: params.provider,
      avatarColor: palette[db.users.length % palette.length],
      balance: 500,
      referralCode: newCode,
      friendCode: createFriendCode(db.users),
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
      xp: getCardDiscoveryXp(db.items.find((it) => it.id === 'card_artemiy_daun')),
      unlockedItemIds: ['card_artemiy_daun'],
      claimedCollectionRewards: [],
      equippedBadgeCollection: null,
      showcaseItemIds: [],
      unlockedAchievementIds: [],
      claimedAchievementIds: [],
      achievementStats: createEmptyAchievementStats(),
      inventory: [
        { instanceId: uid('inv'), itemId: 'card_artemiy_daun', acquiredAt: Date.now(), source: 'starter' },
      ],
      createdAt: Date.now(),
    };
    syncUserAchievements(user);
    db.users.push(user);
    recordTx(user, 'welcome_bonus', 500, 'Стартовый игровой бонус');
  } else {
    if (tgId) user.telegramId = tgId;
    if (cleanHandle) user.telegramUsername = cleanHandle;
    if (cleanDisplay) user.telegramFirstName = cleanDisplay;
    if (params.photoUrl) user.telegramPhotoUrl = params.photoUrl;
    user.authProvider = params.provider;
    user.claimedCollectionRewards ??= [];
    user.equippedBadgeCollection ??= null;
    user.showcaseItemIds ??= [];
    user.unlockedAchievementIds ??= [];
    user.claimedAchievementIds ??= [];
    syncUserAchievements(user);
  }

  saveDb();
  return user;
}

function saveDataUrlImageIfNeeded(imageUrl: string): string {
  const match = imageUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
  if (!match) return imageUrl;
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  // Keep uploaded card art in the database payload so it survives Render restarts.
  // Reject malformed/oversized data instead of writing an ephemeral local file.
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('Изображение должно быть меньше 2 МБ.');
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
}

async function startServer() {
  await initializePostgres();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));
  usePostgresState(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storage: postgresPool ? 'postgres' : 'local' });
  });

  const telegramBotToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const telegramWebAppUrl = (
    process.env.TELEGRAM_WEBAPP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL ||
    ''
  ).trim();
  let telegramBotUsername = (
    process.env.TELEGRAM_BOT_USERNAME ??
    process.env.VITE_TELEGRAM_BOT_USERNAME ??
    ''
  )
    .replace(/^@+/, '')
    .trim();

  if (telegramBotToken && !telegramBotUsername) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getMe`);
      const meJson = (await meRes.json()) as { ok?: boolean; result?: { username?: string } };
      if (meJson.ok && meJson.result?.username) {
        telegramBotUsername = meJson.result.username;
      }
    } catch {
      // Ignore network failure at boot; webhook/config still stays responsive
    }
  }

  const sendTelegramStartReply = async (chatId: number, firstName?: string) => {
    if (!telegramBotToken) return;
    const greeting = firstName ? `Привет, ${firstName}!` : 'Привет!';
    const hasHttpsUrl = telegramWebAppUrl.startsWith('https://');
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: `${greeting} Добро пожаловать в «Ферму» — открывай кейсы, крути апгрейды, подписывай контракты 7-в-1 и собирай коллекции карточек.`,
    };
    if (hasHttpsUrl) {
      body.reply_markup = {
        inline_keyboard: [[{ text: '🚀 Открыть Ферму', web_app: { url: telegramWebAppUrl } }]],
      };
    }
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  };

  if (telegramBotToken) {
    void (async () => {
      try {
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [{ command: 'start', description: 'Открыть Ферму (Mini App)' }],
          }),
        });
        if (telegramWebAppUrl.startsWith('https://')) {
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/setChatMenuButton`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              menu_button: {
                type: 'web_app',
                text: 'Ферма',
                web_app: { url: telegramWebAppUrl },
              },
            }),
          });
        }

        if (process.env.TELEGRAM_BOT_POLLING !== 'false') {
          await fetch(`https://api.telegram.org/bot${telegramBotToken}/deleteWebhook?drop_pending_updates=false`).catch(() => undefined);
          let offset = 0;
          while (true) {
            const pollRes = await fetch(
              `https://api.telegram.org/bot${telegramBotToken}/getUpdates?timeout=20&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`
            );
            if (pollRes.status === 401 || pollRes.status === 409) break;
            const pollJson = (await pollRes.json()) as {
              ok?: boolean;
              result?: Array<{
                update_id: number;
                message?: { chat?: { id?: number }; text?: string; from?: { first_name?: string } };
              }>;
            };
            if (!pollJson.ok || !Array.isArray(pollJson.result)) {
              await new Promise((resolve) => setTimeout(resolve, 4000));
              continue;
            }
            for (const update of pollJson.result) {
              offset = Math.max(offset, update.update_id + 1);
              const text = update.message?.text?.trim() ?? '';
              const chatId = update.message?.chat?.id;
              if (chatId && text.startsWith('/start')) {
                await sendTelegramStartReply(chatId, update.message?.from?.first_name);
              }
            }
          }
        }
      } catch {
        // Non-fatal: server stays healthy even if Telegram polling encounters a transient error.
      }
    })();
  }

  app.post('/api/telegram/webhook', (req, res) => {
    const body = req.body as {
      message?: { chat?: { id?: number }; text?: string; from?: { first_name?: string } };
    };
    const chatId = body?.message?.chat?.id;
    const text = body?.message?.text?.trim() ?? '';
    if (telegramBotToken && chatId && text.startsWith('/start')) {
      void sendTelegramStartReply(chatId, body?.message?.from?.first_name);
    }
    res.json({ ok: true });
  });

  app.get('/api/bootstrap', (req, res) => {
    const sessionUid = verifySessionToken(extractSessionCookie(req));
    const authenticated = Boolean(sessionUid && db.users.some((user) => user.id === sessionUid));
    res.json(buildPayload(authenticated ? sessionUid! : undefined, authenticated));
  });

  app.get('/api/live-drops', (_req, res) => {
    res.json({ liveDrops: db.liveDrops.slice(0, 24) });
  });

  app.post('/api/friends', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const code = String((req.body as { code?: unknown }).code ?? '').trim().toUpperCase();
    if (!code || code.length > 40) {
      res.status(400).json({ error: 'Введите корректный код друга.' });
      return;
    }
    const friend = db.users.find((candidate) => candidate.friendCode.toUpperCase() === code);
    if (!friend) {
      res.status(404).json({ error: 'Пользователь с таким кодом не найден.' });
      return;
    }
    if (friend.id === user.id) {
      res.status(400).json({ error: 'Нельзя добавить самого себя.' });
      return;
    }
    user.friends ??= [];
    friend.friends ??= [];
    if (user.friends.includes(friend.id)) {
      res.status(409).json({ error: 'Этот пользователь уже есть в друзьях.' });
      return;
    }
    if (db.friendRequests.some((request) => request.fromUserId === user.id && request.toUserId === friend.id)) {
      res.status(409).json({ error: 'Запрос этому пользователю уже отправлен.' });
      return;
    }
    if (db.friendRequests.some((request) => request.fromUserId === friend.id && request.toUserId === user.id)) {
      res.status(409).json({ error: 'Этот пользователь уже отправил вам запрос. Примите его в разделе «Друзья».' });
      return;
    }
    const request: PersistedFriendRequest = { id: uid('friend_request'), fromUserId: user.id, toUserId: friend.id, createdAt: Date.now() };
    db.friendRequests.unshift(request);
    saveDb();
    sendRealtimeToUser(friend.id, { type: 'friend_request', requestId: request.id, username: user.username });
    res.json({ payload: buildPayload(user.id), requestSent: true });
  });

  app.post('/api/friends/requests/:requestId/accept', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const requestIndex = db.friendRequests.findIndex((entry) => entry.id === req.params.requestId && entry.toUserId === user.id);
    if (requestIndex < 0) {
      res.status(404).json({ error: 'Запрос в друзья не найден.' });
      return;
    }
    const [request] = db.friendRequests.splice(requestIndex, 1);
    const sender = db.users.find((candidate) => candidate.id === request.fromUserId);
    if (!sender) {
      res.status(404).json({ error: 'Аккаунт отправителя больше не существует.' });
      return;
    }
    user.friends ??= [];
    sender.friends ??= [];
    if (!user.friends.includes(sender.id)) user.friends.push(sender.id);
    if (!sender.friends.includes(user.id)) sender.friends.push(user.id);
    db.friendRequests = db.friendRequests.filter((entry) =>
      !(entry.fromUserId === sender.id && entry.toUserId === user.id)
      && !(entry.fromUserId === user.id && entry.toUserId === sender.id)
    );
    syncUserAchievements(user);
    syncUserAchievements(sender);
    saveDb();
    sendRealtimeToUser(sender.id, { type: 'friend_request_accepted', username: user.username });
    res.json({ payload: buildPayload(user.id) });
  });

  app.delete('/api/friends/requests/:requestId', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const requestIndex = db.friendRequests.findIndex((entry) => entry.id === req.params.requestId && entry.toUserId === user.id);
    if (requestIndex < 0) {
      res.status(404).json({ error: 'Запрос в друзья не найден.' });
      return;
    }
    const [request] = db.friendRequests.splice(requestIndex, 1);
    saveDb();
    sendRealtimeToUser(request.fromUserId, { type: 'friend_request_declined', username: user.username });
    res.json({ payload: buildPayload(user.id) });
  });

  app.delete('/api/friends/:friendId', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const friend = db.users.find((candidate) => candidate.id === req.params.friendId);
    if (!friend || !user.friends.includes(friend.id)) {
      res.status(404).json({ error: 'Друг не найден в вашем списке.' });
      return;
    }
    user.friends = user.friends.filter((id) => id !== friend.id);
    friend.friends = friend.friends.filter((id) => id !== user.id);
    saveDb();
    res.json({ payload: buildPayload(user.id) });
  });

  app.get('/api/friends/:friendId/profile', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    if (!user.friends.includes(req.params.friendId)) {
      res.status(403).json({ error: 'Профиль доступен только друзьям.' });
      return;
    }
    const friend = db.users.find((candidate) => candidate.id === req.params.friendId);
    if (!friend) {
      res.status(404).json({ error: 'Профиль не найден.' });
      return;
    }
    const topDrop = friend.topDropItemId
      ? db.items.find((item) => item.id === friend.topDropItemId) ?? null
      : null;
    const showcaseItems = (friend.showcaseItemIds ?? [])
      .map((id) => db.items.find((item) => item.id === id))
      .filter((item): item is ItemCard => Boolean(item))
      .slice(0, 3);
    const profile: FriendProfile = {
      id: friend.id,
      username: friend.username,
      telegramUsername: friend.telegramUsername,
      telegramPhotoUrl: friend.telegramPhotoUrl,
      avatarColor: friend.avatarColor,
      xp: friend.xp ?? 0,
      equippedBadgeCollection: friend.equippedBadgeCollection ?? null,
      showcaseItems,
      unlockedAchievementsCount: (friend.unlockedAchievementIds ?? []).length,
      totalUpgrades: friend.totalUpgrades,
      wonUpgrades: friend.wonUpgrades,
      totalCasesOpened: friend.totalCasesOpened,
      topDrop,
      topDropPrice: friend.topDropPrice,
      inventory: friend.inventory
        .map((entry) => ({ item: db.items.find((item) => item.id === entry.itemId), acquiredAt: entry.acquiredAt }))
        .filter((entry): entry is { item: ItemCard; acquiredAt: number } => Boolean(entry.item)),
      createdAt: friend.createdAt,
    };
    res.json({ profile });
  });

  app.get('/api/auth/telegram/config', (_req, res) => {
    res.json({
      botConfigured: Boolean(telegramBotToken && telegramBotUsername),
      botUsername: telegramBotUsername || null,
      webAppUrl: telegramWebAppUrl || null,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    res.json({ authenticated: true, payload: buildPayload(user.id, true) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractSessionCookie(req);
    if (token) {
      db.revokedTokens = db.revokedTokens ?? [];
      if (!db.revokedTokens.includes(token)) {
        db.revokedTokens.push(token);
        if (db.revokedTokens.length > 200) db.revokedTokens = db.revokedTokens.slice(-200);
        saveDb();
      }
    }
    const https = isHttpsRequest(req);
    res.clearCookie('cardup_tg_session', {
      path: '/',
      httpOnly: true,
      secure: https,
      sameSite: https ? 'none' : 'lax',
    });
    res.json({ ok: true });
  });

  // 1. Official Telegram Login Widget verification (HMAC-SHA256 using SHA256(TELEGRAM_BOT_TOKEN))
  app.post('/api/auth/telegram/verify-widget', (req, res) => {
    if (!telegramBotToken) {
      res.status(503).json({
        error: 'На сервере не настроен TELEGRAM_BOT_TOKEN для криптографической проверки Telegram Widget.',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const check = verifyTelegramLoginWidget(body, telegramBotToken);
    if (!check.valid || typeof body.id !== 'number' || !Number.isSafeInteger(body.id) || body.id <= 0) {
      res.status(401).json({ error: check.reason || 'Ошибка проверки подписи Telegram.' });
      return;
    }
    if (!consumeTelegramHash(String(body.hash))) {
      res.status(401).json({ error: 'Эти данные Telegram уже были использованы. Начните вход заново.' });
      return;
    }

    const user = upsertTelegramUser({
      telegramId: String(body.id),
      username: typeof body.username === 'string' ? body.username : undefined,
      firstName: typeof body.first_name === 'string' ? body.first_name : undefined,
      photoUrl: typeof body.photo_url === 'string' ? body.photo_url : undefined,
      provider: 'telegram_widget',
    });

    const sessionToken = issueSessionToken(user.id);
    setSessionCookie(req, res, sessionToken);
    res.json({ payload: buildPayload(user.id, true) });
  });

  // 2. Official Telegram Mini App (WebApp.initData) cryptographic verification
  app.post('/api/auth/telegram/verify-webapp', (req, res) => {
    if (!telegramBotToken) {
      res.status(503).json({
        error: 'На сервере не настроен TELEGRAM_BOT_TOKEN для проверки Telegram Mini App.',
      });
      return;
    }
    const { initData } = req.body as { initData?: string };
    if (!initData) {
      res.status(400).json({ error: 'Отсутствует параметр initData.' });
      return;
    }
    const check = verifyTelegramWebAppInitData(initData, telegramBotToken);
    if (!check.valid || !check.user) {
      res.status(401).json({ error: check.reason || 'Неверные данные Mini App.' });
      return;
    }
    const initHash = new URLSearchParams(initData).get('hash') ?? '';
    if (!consumeTelegramHash(initHash)) {
      res.status(401).json({ error: 'Эти данные Telegram уже были использованы. Перезапустите приложение.' });
      return;
    }

    const user = upsertTelegramUser({
      telegramId: String(check.user.id),
      username: check.user.username,
      firstName: check.user.first_name,
      photoUrl: check.user.photo_url,
      provider: 'telegram_webapp',
    });

    const sessionToken = issueSessionToken(user.id);
    setSessionCookie(req, res, sessionToken);
    res.json({ payload: buildPayload(user.id, true) });
  });

  app.post('/api/referral/apply', (req, res) => {
    const { code } = req.body as { code?: string };
    const user = authenticatedUser(req, res);
    if (!user) return;
    const cleanCode = (code ?? '').trim().toUpperCase();

    if (!cleanCode) {
      res.status(400).json({ error: 'Введите реферальный код.' });
      return;
    }
    if (user.referredByCode) {
      res.status(400).json({ error: 'Реферальный код уже активирован для этого аккаунта.' });
      return;
    }
    if (cleanCode === user.referralCode.toUpperCase()) {
      res.status(400).json({ error: 'Нельзя активировать собственный реферальный код.' });
      return;
    }
    const referrer = db.users.find((u) => u.referralCode.toUpperCase() === cleanCode);
    if (!referrer) {
      res.status(404).json({ error: 'Реферальный код не найден.' });
      return;
    }

    user.referredByCode = referrer.referralCode;
    user.balance += 300;
    referrer.balance += 150;
    referrer.referralCount += 1;
    referrer.referralEarned += 150;

    recordTx(user, 'referral_bonus', 300, `Бонус за активацию кода ${referrer.referralCode}`);
    recordTx(referrer, 'referral_bonus', 150, `Новый реферал: ${user.username}`);
    saveDb();

    res.json({ payload: buildPayload(user.id), bonus: 300 });
  });

  const resolveBattle = (room: PersistedBattleRoom) => {
    const host = db.users.find((entry) => entry.id === room.hostUserId)!;
    const guest = db.users.find((entry) => entry.id === room.guestUserId)!;
    const awarded: InventoryItem[] = [];
    const awardedByUser: Record<string, string[]> = {};
    if (room.mode === 'cases') {
      const caseBox = db.cases.find((entry) => entry.id === room.caseId)!;
      const pool = caseBox.itemIds.map((id) => db.items.find((entry) => entry.id === id)).filter((item): item is ItemCard => Boolean(item));
      const probs = calculateCaseDropProbabilities(caseBox, pool);
      room.roundResults = Array.from({ length: room.caseCount ?? 1 }, (_, index) => ({
        round: index + 1,
        hostDrop: pickWeightedCaseDrop(probs, crypto.randomInt(0, 1_000_000) / 1_000_000),
        guestDrop: pickWeightedCaseDrop(probs, crypto.randomInt(0, 1_000_000) / 1_000_000),
      }));
      host.totalCasesOpened += room.caseCount ?? 1;
      guest.totalCasesOpened += room.caseCount ?? 1;
      const hostTotal = room.roundResults.reduce((sum, row) => sum + row.hostDrop.price, 0);
      const guestTotal = room.roundResults.reduce((sum, row) => sum + row.guestDrop.price, 0);
      room.winnerUserId = hostTotal === guestTotal ? null : hostTotal > guestTotal ? host.id : guest.id;
      const giveDrops = (recipient: UserProfile, drops: ItemCard[]) => {
        for (const item of drops) {
          const inventory: InventoryItem = { instanceId: uid('inv'), itemId: item.id, acquiredAt: Date.now(), source: 'battle' };
          recipient.inventory.push(inventory); awarded.push(inventory);
          grantCardDiscovery(recipient, item.id);
          if (item.rarity === 'legendary') {
            recipient.achievementStats = recipient.achievementStats ?? createEmptyAchievementStats();
            recipient.achievementStats.legendaryCaseDrop = true;
          }
          noteTopDrop(recipient, item); pushLiveDrop(recipient.username, item.id, 'case');
          (awardedByUser[recipient.id] ??= []).push(inventory.instanceId);
        }
      };
      if (room.winnerUserId) {
        const winner = room.winnerUserId === host.id ? host : guest;
        giveDrops(winner, room.roundResults.flatMap((row) => [row.hostDrop, row.guestDrop]));
      } else {
        giveDrops(host, room.roundResults.map((row) => row.hostDrop));
        giveDrops(guest, room.roundResults.map((row) => row.guestDrop));
      }
    } else {
      const hostValue = room.hostStakeValue;
      const guestValue = room.guestStakeValue;
      room.hostWinChance = Number((hostValue / (hostValue + guestValue) * 100).toFixed(4));
      room.rollValue = crypto.randomInt(0, 10_000_000) / 100_000;
      room.winnerUserId = room.rollValue < room.hostWinChance ? host.id : guest.id;
      const winner = room.winnerUserId === host.id ? host : guest;
      const items = [...room.hostItems, ...(room.guestItems ?? [])];
      for (const inventory of items) {
        const won = { ...inventory, source: 'battle' as const };
        winner.inventory.push(won); awarded.push(won);
        grantCardDiscovery(winner, won.itemId);
        (awardedByUser[winner.id] ??= []).push(won.instanceId);
        const card = db.items.find((item) => item.id === won.itemId); if (card) noteTopDrop(winner, card);
      }
    }
    room.awardedInventoryIds = awarded.map((entry) => entry.instanceId);
    room.awardedInventoryIdsByUser = awardedByUser;
    room.startedAt = Date.now();
    room.durationMs = (room.mode === 'cases' ? (room.caseCount ?? 1) * 5400 : 4200);
    room.status = 'completed';
    for (const invite of db.battleInvitations) {
      if (invite.roomId === room.id && invite.status === 'pending') {
        invite.status = 'declined';
        sendRealtimeToUser(invite.toUserId, { type: 'battle_invitation_expired', roomId: room.id });
      }
    }
    if (room.winnerUserId) {
      const winner = db.users.find((entry) => entry.id === room.winnerUserId)!;
      winner.achievementStats = winner.achievementStats ?? createEmptyAchievementStats();
      winner.achievementStats.battleWins += 1;
      recordTx(winner, 'battle_win', 0, 'Выигрыш в батле', `${awarded.length} карточек добавлено в инвентарь`);
    }
    syncUserAchievements(host);
    syncUserAchievements(guest);
    sendRealtimeToBattle(room, { type: 'battle_started', roomId: room.id, startedAt: room.startedAt });
    room.roundResults?.forEach((round, index) => {
      setTimeout(() => sendRealtimeToBattle(room, { type: 'battle_round', roomId: room.id, round: index + 1, payload: round }), (index + 1) * 5400);
    });
    setTimeout(() => sendRealtimeToBattle(room, { type: 'battle_finished', roomId: room.id, winnerUserId: room.winnerUserId }), room.durationMs);
  };

  const joinBattle = (user: UserProfile, room: PersistedBattleRoom, password: string, stakeIds: string[], invited: boolean) => {
    if (room.status !== 'waiting' || room.hostUserId === user.id || room.guestUserId) throw new Error('Комната уже недоступна.');
    if (!invited && room.hasPassword) {
      const actual = crypto.createHash('sha256').update(password).digest('hex');
      if (!room.passwordHash || actual !== room.passwordHash) throw new Error('Неверный пароль комнаты.');
    }
    if (room.mode === 'cases') {
      const box = db.cases.find((entry) => entry.id === room.caseId);
      if (!box || !box.itemIds.some((id) => db.items.some((item) => item.id === id))) throw new Error('Кейс больше недоступен для открытия.');
      const cost = box.price * (room.caseCount ?? 1);
      if (user.balance < cost) throw new Error('Недостаточно TC для участия в батле.');
      user.balance -= cost; recordTx(user, 'battle_stake', -cost, 'Взнос в батл кейсов');
    } else {
      const uniqueIds = [...new Set(stakeIds)];
      const entries = user.inventory.filter((entry) => uniqueIds.includes(entry.instanceId));
      const value = entries.reduce((sum, entry) => sum + (db.items.find((item) => item.id === entry.itemId)?.price ?? 0), 0);
      if (!entries.length || entries.length !== uniqueIds.length || value <= 0) throw new Error('Выберите карточки для ставки.');
      user.inventory = user.inventory.filter((entry) => !uniqueIds.includes(entry.instanceId));
      room.guestItems = entries; room.guestStakeValue = value;
      recordTx(user, 'battle_stake', 0, 'Карточки поставлены в батл', `${entries.length} карточек · ${value} TC по каталогу`);
    }
    room.guestUserId = user.id; room.guestUsername = user.username;
    resolveBattle(room);
  };

  app.get('/api/battles', (_req, res) => {
    res.json({ battles: db.battles.filter((room) => room.status === 'waiting').map((room) => publicBattle(room)) });
  });

  app.get('/api/battles/current', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const room = db.battles.find((entry) => (entry.hostUserId === user.id || entry.guestUserId === user.id)
      && (entry.status === 'waiting' || (entry.status === 'completed' && Date.now() - (entry.startedAt ?? 0) < (entry.durationMs ?? 0) + 60_000)));
    res.json({ battle: room ? publicBattle(room, user.id) : null });
  });

  app.post('/api/battles', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const { mode, caseId, caseCount, password, stakeItemIds } = req.body as { mode?: BattleMode; caseId?: string; caseCount?: number; password?: string; stakeItemIds?: string[] };
    if (mode !== 'cases' && mode !== 'upgrade') { res.status(400).json({ error: 'Выберите режим батла.' }); return; }
    const room: PersistedBattleRoom = { id: uid('battle'), mode, status: 'waiting', hostUserId: user.id, hostUsername: user.username, guestUserId: null, guestUsername: null, hasPassword: Boolean(password?.trim()), passwordHash: password?.trim() ? crypto.createHash('sha256').update(password.trim()).digest('hex') : undefined, hostItems: [], hostStakeValue: 0, guestStakeValue: 0, createdAt: Date.now() };
    if (mode === 'cases') {
      const box = db.cases.find((entry) => entry.id === caseId);
      const count = Number(caseCount);
      if (!box || !box.itemIds.some((id) => db.items.some((item) => item.id === id)) || !Number.isInteger(count) || count < 1 || count > 25) { res.status(400).json({ error: 'Выберите доступный кейс и число открытий от 1 до 25.' }); return; }
      const cost = box.price * count;
      if (user.balance < cost) { res.status(400).json({ error: 'Недостаточно TC для ставки на кейсы.' }); return; }
      user.balance -= cost; recordTx(user, 'battle_stake', -cost, 'Взнос в батл кейсов');
      room.caseId = box.id; room.caseName = box.name; room.caseCount = count;
    } else {
      const ids = [...new Set(Array.isArray(stakeItemIds) ? stakeItemIds : [])];
      const entries = user.inventory.filter((entry) => ids.includes(entry.instanceId));
      const value = entries.reduce((sum, entry) => sum + (db.items.find((item) => item.id === entry.itemId)?.price ?? 0), 0);
      if (!entries.length || ids.length !== entries.length || value <= 0) { res.status(400).json({ error: 'Выберите карточки для ставки.' }); return; }
      user.inventory = user.inventory.filter((entry) => !ids.includes(entry.instanceId));
      room.hostItems = entries; room.hostStakeValue = value;
      recordTx(user, 'battle_stake', 0, 'Карточки поставлены в батл', `${entries.length} карточек · ${value} TC по каталогу`);
    }
    db.battles.unshift(room); saveDb();
    res.json({ payload: buildPayload(user.id), battle: publicBattle(room, user.id) });
  });

  app.get('/api/battles/:id', (req, res) => {
    const room = db.battles.find((entry) => entry.id === req.params.id);
    if (!room) { res.status(404).json({ error: 'Комната не найдена.' }); return; }
    const user = authenticatedUser(req, res); if (!user) return;
    if (room.hostUserId !== user.id && room.guestUserId !== user.id) { res.status(403).json({ error: 'Комната доступна только участникам.' }); return; }
    res.json({ battle: publicBattle(room, user.id) });
  });

  app.post('/api/battles/:id/join', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const room = db.battles.find((entry) => entry.id === req.params.id);
    if (!room) { res.status(404).json({ error: 'Комната не найдена.' }); return; }
    try { joinBattle(user, room, String(req.body.password ?? ''), Array.isArray(req.body.stakeItemIds) ? req.body.stakeItemIds : [], false); saveDb(); res.json({ payload: buildPayload(user.id), battle: publicBattle(room, user.id) }); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось войти в комнату.' }); }
  });

  app.delete('/api/battles/:id', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const room = db.battles.find((entry) => entry.id === req.params.id);
    if (!room || room.hostUserId !== user.id || room.status !== 'waiting') { res.status(404).json({ error: 'Комната уже недоступна.' }); return; }
    if (room.mode === 'cases') {
      const refund = (db.cases.find((box) => box.id === room.caseId)?.price ?? 0) * (room.caseCount ?? 1);
      user.balance += refund; recordTx(user, 'battle_stake', refund, 'Возврат ставки за отменённую комнату');
    } else {
      user.inventory.push(...room.hostItems); recordTx(user, 'battle_stake', 0, 'Возврат ставки за отменённую комнату', 'Карточки вернулись в инвентарь');
    }
    for (const invite of db.battleInvitations) if (invite.roomId === room.id && invite.status === 'pending') {
      invite.status = 'declined'; sendRealtimeToUser(invite.toUserId, { type: 'battle_invitation_expired', roomId: room.id });
    }
    room.status = 'cancelled'; saveDb(); res.json({ payload: buildPayload(user.id) });
  });

  app.post('/api/battles/:id/invite', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const room = db.battles.find((entry) => entry.id === req.params.id);
    const friend = db.users.find((entry) => entry.id === req.body.friendId);
    if (!room || room.hostUserId !== user.id || room.status !== 'waiting' || !friend || !user.friends.includes(friend.id)) { res.status(400).json({ error: 'Пригласить можно только друга в свою свободную комнату.' }); return; }
    if (db.battleInvitations.some((entry) => entry.roomId === room.id && entry.toUserId === friend.id && entry.status === 'pending')) { res.status(400).json({ error: 'Приглашение уже отправлено.' }); return; }
    const invite: PersistedBattleInvitation = { id: uid('invite'), roomId: room.id, fromUserId: user.id, toUserId: friend.id, status: 'pending', createdAt: Date.now() };
    db.battleInvitations.unshift(invite); saveDb(); sendRealtimeToUser(friend.id, { type: 'battle_invitation', inviteId: invite.id, roomId: room.id, fromUsername: user.username }); res.json({ ok: true });
  });

  app.post('/api/battle-invitations/:id/accept', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const invite = db.battleInvitations.find((entry) => entry.id === req.params.id && entry.toUserId === user.id && entry.status === 'pending');
    const room = invite && db.battles.find((entry) => entry.id === invite.roomId);
    if (!invite || !room) { res.status(404).json({ error: 'Приглашение устарело.' }); return; }
    try { joinBattle(user, room, '', Array.isArray(req.body.stakeItemIds) ? req.body.stakeItemIds : [], true); invite.status = 'accepted'; saveDb(); sendRealtimeToUser(invite.fromUserId, { type: 'battle_invitation_accepted', roomId: room.id, username: user.username }); res.json({ payload: buildPayload(user.id), battle: publicBattle(room, user.id) }); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось принять приглашение.' }); }
  });

  app.delete('/api/battle-invitations/:id', (req, res) => {
    const user = authenticatedUser(req, res); if (!user) return;
    const invite = db.battleInvitations.find((entry) => entry.id === req.params.id && entry.toUserId === user.id && entry.status === 'pending');
    if (!invite) { res.status(404).json({ error: 'Приглашение не найдено.' }); return; }
    invite.status = 'declined'; saveDb(); sendRealtimeToUser(invite.fromUserId, { type: 'battle_invitation_declined', username: user.username }); res.json({ payload: buildPayload(user.id) });
  });

  app.post('/api/finance/deposit', (_req, res) => {
    res.status(410).json({ error: 'Свободное пополнение отключено — зарабатывай TC в мини-играх!' });
  });

  app.post('/api/minigames/harvest/start', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const now = Date.now();
    const energy = syncMinigameEnergy(user, now);
    const slot = energy.harvest;
    if (slot.charges <= 0) {
      res.status(400).json({ error: 'Заряды для «Урожая на Ферме» закончились. Подожди восстановления или сыграй в другую игру.' });
      return;
    }

    if (slot.charges === MINIGAME_MAX_CHARGES) slot.lastRechargeAt = now;
    slot.charges -= 1;
    slot.playsCount += 1;

    db.minigameSessions = (db.minigameSessions ?? []).filter(
      (s) => !(s.userId === user.id && s.game === 'harvest' && s.status === 'active')
    );
    const session: PersistedMinigameSession = {
      id: uid('mg_h'),
      userId: user.id,
      game: 'harvest',
      status: 'active',
      startedAt: now,
      expiresAt: now + 90_000,
    };
    db.minigameSessions.push(session);
    saveDb();
    res.json({ sessionId: session.id, durationMs: 20_000, payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/harvest/finish', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const { sessionId, score, hits } = req.body as { sessionId?: string; score?: number; hits?: number };
    const now = Date.now();
    const session = (db.minigameSessions ?? []).find(
      (s) => s.id === sessionId && s.userId === user.id && s.game === 'harvest' && s.status === 'active'
    );
    if (!session) {
      res.status(404).json({ error: 'Игровая сессия не найдена или уже завершена.' });
      return;
    }
    if (now > session.expiresAt) {
      session.status = 'completed';
      saveDb();
      res.status(400).json({ error: 'Время сессии истекло.' });
      return;
    }

    const elapsedMs = now - session.startedAt;
    if (elapsedMs < 15_000) {
      res.status(400).json({ error: 'Раунд ещё не завершён.' });
      return;
    }

    const safeHits = Math.max(0, Math.min(60, Math.floor(Number(hits) || 0)));
    const plausibleCap = safeHits * 55;
    const reward = Math.max(0, Math.min(480, plausibleCap, Math.round(Number(score) || 0)));

    session.status = 'completed';
    const energy = syncMinigameEnergy(user, now);
    if (reward > energy.harvest.bestScore) energy.harvest.bestScore = reward;
    if (reward > 0) {
      user.balance += reward;
      recordTx(user, 'minigame_harvest', reward, 'Мини-игра «Урожай на Ферме»');
    }
    saveDb();
    res.json({ reward, bestScore: energy.harvest.bestScore, payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/mines/start', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const now = Date.now();
    const existingActive = (db.minigameSessions ?? []).find(
      (s) => s.userId === user.id && s.game === 'mines' && s.status === 'active'
    );
    if (existingActive) {
      res.json({ board: publicMinesBoard(existingActive), payload: buildPayload(user.id) });
      return;
    }

    const energy = syncMinigameEnergy(user, now);
    const slot = energy.mines;
    if (slot.charges <= 0) {
      res.status(400).json({ error: 'Заряды для «Минного поля ПТУ» закончились. Подожди восстановления!' });
      return;
    }
    if (slot.charges === MINIGAME_MAX_CHARGES) slot.lastRechargeAt = now;
    slot.charges -= 1;
    slot.playsCount += 1;

    const indices = Array.from({ length: MINES_GRID_SIZE }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const mineIndices = indices.slice(0, MINES_TRAP_COUNT);

    const session: PersistedMinigameSession = {
      id: uid('mg_m'),
      userId: user.id,
      game: 'mines',
      status: 'active',
      startedAt: now,
      expiresAt: now + 3600_000,
      mineIndices,
      revealedSafe: [],
      currentBank: 0,
    };
    db.minigameSessions = db.minigameSessions ?? [];
    db.minigameSessions.push(session);
    saveDb();
    res.json({ board: publicMinesBoard(session), payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/mines/step', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const { sessionId, cellIndex } = req.body as { sessionId?: string; cellIndex?: number };
    const idx = Math.floor(Number(cellIndex));
    if (!Number.isInteger(idx) || idx < 0 || idx >= MINES_GRID_SIZE) {
      res.status(400).json({ error: 'Неверная клетка поля.' });
      return;
    }
    const session = (db.minigameSessions ?? []).find(
      (s) => s.id === sessionId && s.userId === user.id && s.game === 'mines' && s.status === 'active'
    );
    if (!session) {
      res.status(404).json({ error: 'Раунд не найден или уже завершён.' });
      return;
    }
    const revealedSafe = session.revealedSafe ?? [];
    if (revealedSafe.includes(idx)) {
      res.json({ board: publicMinesBoard(session), payload: buildPayload(user.id) });
      return;
    }

    if ((session.mineIndices ?? []).includes(idx)) {
      session.status = 'busted';
      session.currentBank = 0;
      saveDb();
      res.json({ board: publicMinesBoard(session), hitTrapIndex: idx, reward: 0, payload: buildPayload(user.id) });
      return;
    }

    const stepBonus = MINES_STEP_BONUSES[Math.min(revealedSafe.length, MINES_STEP_BONUSES.length - 1)];
    revealedSafe.push(idx);
    session.revealedSafe = revealedSafe;
    session.currentBank = (session.currentBank ?? 0) + stepBonus;

    let reward = 0;
    if (revealedSafe.length >= MINES_GRID_SIZE - MINES_TRAP_COUNT) {
      session.status = 'completed';
      reward = session.currentBank;
      const energy = syncMinigameEnergy(user, Date.now());
      if (reward > energy.mines.bestScore) energy.mines.bestScore = reward;
      user.balance += reward;
      recordTx(user, 'minigame_mines', reward, 'Мини-игра «Минное поле ПТУ» (полная зачистка)');
    }

    saveDb();
    res.json({ board: publicMinesBoard(session), stepBonus, reward, payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/mines/cashout', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const { sessionId } = req.body as { sessionId?: string };
    const session = (db.minigameSessions ?? []).find(
      (s) => s.id === sessionId && s.userId === user.id && s.game === 'mines' && s.status === 'active'
    );
    if (!session) {
      res.status(404).json({ error: 'Активный раунд не найден.' });
      return;
    }
    const reward = Math.max(0, Math.round(session.currentBank ?? 0));
    if (reward <= 0) {
      res.status(400).json({ error: 'Открой хотя бы одну безопасную клетку.' });
      return;
    }
    session.status = 'completed';
    const energy = syncMinigameEnergy(user, Date.now());
    if (reward > energy.mines.bestScore) energy.mines.bestScore = reward;
    user.balance += reward;
    recordTx(user, 'minigame_mines', reward, `Мини-игра «Минное поле ПТУ» (${session.revealedSafe?.length ?? 0} кл.)`);
    saveDb();
    res.json({ board: publicMinesBoard(session), reward, payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/race/start', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const now = Date.now();
    const energy = syncMinigameEnergy(user, now);
    const slot = energy.race;
    if (slot.charges <= 0) {
      res.status(400).json({ error: 'Топливо для «Гонки на TENET T4» закончилось. Подожди восстановления!' });
      return;
    }
    if (slot.charges === MINIGAME_MAX_CHARGES) slot.lastRechargeAt = now;
    slot.charges -= 1;
    slot.playsCount += 1;

    db.minigameSessions = (db.minigameSessions ?? []).filter(
      (s) => !(s.userId === user.id && s.game === 'race' && s.status === 'active')
    );
    const session: PersistedMinigameSession = {
      id: uid('mg_r'),
      userId: user.id,
      game: 'race',
      status: 'active',
      startedAt: now,
      expiresAt: now + 120_000,
    };
    db.minigameSessions.push(session);
    saveDb();
    res.json({ sessionId: session.id, durationMs: 25_000, payload: buildPayload(user.id) });
  });

  app.post('/api/minigames/race/finish', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const { sessionId, coinsCollected, distanceMeters, survived } = req.body as {
      sessionId?: string;
      coinsCollected?: number;
      distanceMeters?: number;
      survived?: boolean;
    };
    const now = Date.now();
    const session = (db.minigameSessions ?? []).find(
      (s) => s.id === sessionId && s.userId === user.id && s.game === 'race' && s.status === 'active'
    );
    if (!session) {
      res.status(404).json({ error: 'Заезд не найден или уже завершён.' });
      return;
    }
    if (now > session.expiresAt) {
      session.status = 'completed';
      saveDb();
      res.status(400).json({ error: 'Время заезда истекло.' });
      return;
    }

    const elapsedMs = now - session.startedAt;
    const maxPlausibleCoins = Math.min(18, Math.floor(elapsedMs / 900) + 1);
    const cleanCoins = Math.max(0, Math.min(maxPlausibleCoins, Math.floor(Number(coinsCollected) || 0)));
    const cleanDist = Math.max(0, Math.min(1800, Math.floor(Number(distanceMeters) || 0)));
    const isSurvived = Boolean(survived) && elapsedMs >= 20_000;

    const coinsReward = cleanCoins * 20;
    const distanceBonus = isSurvived ? 120 : Math.min(80, Math.floor(cleanDist / 14));
    const reward = Math.max(0, Math.min(500, coinsReward + distanceBonus));

    session.status = 'completed';
    const energy = syncMinigameEnergy(user, now);
    if (reward > energy.race.bestScore) energy.race.bestScore = reward;
    if (reward > 0) {
      user.balance += reward;
      recordTx(user, 'minigame_race', reward, 'Мини-игра «Гонка на TENET T4»');
    }
    saveDb();
    res.json({ reward, bestScore: energy.race.bestScore, payload: buildPayload(user.id) });
  });

  app.post('/api/bonus/daily', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;

    if (user.lastDailyClaimAt && now - user.lastDailyClaimAt < cooldownMs) {
      const remainingMs = cooldownMs - (now - user.lastDailyClaimAt);
      res.status(400).json({ error: 'Ежедневный бонус уже получен.', remainingMs });
      return;
    }

    const nextStreak = user.dailyStreak + 1;
    const reward = calculateDailyReward(nextStreak);
    user.dailyStreak = nextStreak;
    user.lastDailyClaimAt = now;
    user.balance += reward;

    recordTx(user, 'daily_bonus', reward, `Ежедневный бонус (День ${((nextStreak - 1) % 7) + 1})`);
    saveDb();

    res.json({ payload: buildPayload(user.id), reward, streakDay: ((nextStreak - 1) % 7) + 1 });
  });

  app.post('/api/inventory/sell', (req, res) => {
    const { instanceIds } = req.body as { instanceIds?: string[] };
    const user = authenticatedUser(req, res);
    if (!user) return;
    const ids = Array.isArray(instanceIds) ? instanceIds : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'Выберите хотя бы одну карточку для продажи.' });
      return;
    }

    const idSet = new Set(ids);
    const toSell = user.inventory.filter((inv) => idSet.has(inv.instanceId));
    if (toSell.length === 0) {
      res.status(404).json({ error: 'Предметы не найдены в инвентаре.' });
      return;
    }

    let totalValue = 0;
    for (const inv of toSell) {
      const item = db.items.find((it) => it.id === inv.itemId);
      if (item) totalValue += item.price;
    }

    user.inventory = user.inventory.filter((inv) => !idSet.has(inv.instanceId));
    user.balance += totalValue;
    recordTx(user, 'item_sell', totalValue, `Продажа предметов (${toSell.length} шт.)`);
    saveDb();

    res.json({ payload: buildPayload(user.id), soldValue: totalValue, soldCount: toSell.length });
  });

  app.post('/api/upgrade/roll', (req, res) => {
    const { instanceIds, balanceAdded, targetItemId, mode } = req.body as {
      instanceIds?: string[];
      balanceAdded?: number;
      targetItemId?: string;
      mode?: RollMode;
    };
    const user = authenticatedUser(req, res);
    if (!user) return;
    const targetItem = db.items.find((it) => it.id === targetItemId);
    if (!targetItem) {
      res.status(404).json({ error: 'Целевой предмет не найден.' });
      return;
    }

    const selectedIds = Array.isArray(instanceIds) ? instanceIds : [];
    const selectedSet = new Set(selectedIds);
    const stakedInv = user.inventory.filter((inv) => selectedSet.has(inv.instanceId));
    const safeBalanceAdded = Math.max(0, Math.round(Number(balanceAdded ?? 0)));

    if (safeBalanceAdded > user.balance) {
      res.status(400).json({ error: 'Недостаточно Т-коинов на балансе.' });
      return;
    }

    let itemsValue = 0;
    const stakeItemIds: string[] = [];
    for (const inv of stakedInv) {
      const item = db.items.find((it) => it.id === inv.itemId);
      if (item) {
        itemsValue += item.price;
        stakeItemIds.push(item.id);
      }
    }

    const stakeTotal = itemsValue + safeBalanceAdded;
    if (stakeTotal <= 0) {
      res.status(400).json({ error: 'Выберите предмет или добавьте Т-коины к ставке.' });
      return;
    }
    if (stakeTotal >= targetItem.price) {
      res.status(400).json({ error: 'Стоимость ставки должна быть меньше цены целевого предмета.' });
      return;
    }

    const rollMode: RollMode = mode === 'over' ? 'over' : 'under';
    const odds = calculateUpgradeOdds(stakeTotal, targetItem.price, rollMode);
    const rollValue = crypto.randomInt(0, 10_000_000) / 100_000;
    const won = resolveUpgradeRoll(rollValue, odds.winChance, rollMode);

    // Deduct staked items & balance
    user.inventory = user.inventory.filter((inv) => !selectedSet.has(inv.instanceId));
    if (safeBalanceAdded > 0) {
      user.balance -= safeBalanceAdded;
      recordTx(
        user,
        'upgrade_stake',
        -safeBalanceAdded,
        `Доплата Т-коинами в апгрейд на ${targetItem.name}`
      );
    }

    user.totalUpgrades += 1;
    let wonInstance: InventoryItem | null = null;
    let xpGained = 0;
    if (won) {
      user.wonUpgrades += 1;
      wonInstance = {
        instanceId: uid('inv'),
        itemId: targetItem.id,
        acquiredAt: Date.now(),
        source: 'upgrade',
      };
      user.inventory.unshift(wonInstance);
      xpGained = grantCardDiscovery(user, targetItem.id);
      noteTopDrop(user, targetItem);
      pushLiveDrop(user.username, targetItem.id, 'upgrade', odds.multiplier);
    }

    const entry: UpgradeHistoryEntry = {
      id: uid('upg'),
      userId: user.id,
      stakeItemIds,
      stakeBalanceAdded: safeBalanceAdded,
      stakeTotal,
      targetItemId: targetItem.id,
      targetPrice: targetItem.price,
      winChance: odds.winChance,
      multiplier: odds.multiplier,
      rollMode,
      rollValue,
      won,
      createdAt: Date.now(),
    };
    db.upgradeHistory.unshift(entry);
    user.achievementStats = user.achievementStats ?? createEmptyAchievementStats();
    if (won) {
      user.achievementStats.upgradeWinStreak += 1;
      user.achievementStats.upgradeLoseStreak = 0;
      user.achievementStats.maxUpgradeWinStreak = Math.max(
        user.achievementStats.maxUpgradeWinStreak,
        user.achievementStats.upgradeWinStreak
      );
      if (odds.winChance <= 15) {
        user.achievementStats.lowChanceUpgradeWin = true;
      }
    } else {
      user.achievementStats.upgradeLoseStreak += 1;
      user.achievementStats.upgradeWinStreak = 0;
      user.achievementStats.maxUpgradeLoseStreak = Math.max(
        user.achievementStats.maxUpgradeLoseStreak,
        user.achievementStats.upgradeLoseStreak
      );
    }
    syncUserAchievements(user);

    saveDb();
    res.json({
      payload: buildPayload(user.id),
      result: {
        won,
        rollValue,
        odds,
        targetItem,
        wonInstance,
        xpGained,
      },
    });
  });

  app.post('/api/cases/open', (req, res) => {
    const { caseId } = req.body as { caseId?: string };
    const user = authenticatedUser(req, res);
    if (!user) return;
    const caseBox = db.cases.find((c) => c.id === caseId);
    if (!caseBox) {
      res.status(404).json({ error: 'Кейс не найден.' });
      return;
    }
    if (user.balance < caseBox.price) {
      res.status(400).json({ error: 'Недостаточно Т-коинов для открытия кейса.' });
      return;
    }

    const caseItems = caseBox.itemIds
      .map((id) => db.items.find((it) => it.id === id))
      .filter((it): it is ItemCard => Boolean(it));

    if (caseItems.length < 2) {
      res.status(400).json({ error: 'В кейсе должны оставаться как минимум две карточки.' });
      return;
    }

    const probs = calculateCaseDropProbabilities(caseBox, caseItems);
    const wonItem = pickWeightedCaseDrop(probs, crypto.randomInt(0, 1_000_000) / 1_000_000);

    user.balance -= caseBox.price;
    user.totalCasesOpened += 1;
    const wonInstance: InventoryItem = {
      instanceId: uid('inv'),
      itemId: wonItem.id,
      acquiredAt: Date.now(),
      source: 'case',
    };
    user.inventory.unshift(wonInstance);
    const xpGained = grantCardDiscovery(user, wonItem.id);
    noteTopDrop(user, wonItem);

    recordTx(user, 'case_open', -caseBox.price, `Открытие кейса «${caseBox.name}»`, `Выпал: ${wonItem.name}`);
    pushLiveDrop(user.username, wonItem.id, 'case');
    if (wonItem.rarity === 'legendary') {
      user.achievementStats = user.achievementStats ?? createEmptyAchievementStats();
      user.achievementStats.legendaryCaseDrop = true;
    }
    syncUserAchievements(user);
    saveDb();

    res.json({
      payload: buildPayload(user.id),
      drop: {
        item: wonItem,
        instance: wonInstance,
        probabilities: probs,
        xpGained,
      },
    });
  });

  app.post('/api/collections/claim', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const collection = String((req.body as { collection?: unknown }).collection ?? '').trim();
    if (!collection) {
      res.status(400).json({ error: 'Укажите название коллекции.' });
      return;
    }
    user.claimedCollectionRewards ??= [];
    user.unlockedItemIds ??= [];
    const status = evaluateCollectionSetStatus(
      collection,
      db.items,
      user.unlockedItemIds,
      user.claimedCollectionRewards
    );
    if (status.totalCards === 0) {
      res.status(404).json({ error: 'Коллекция не найдена.' });
      return;
    }
    if (!status.isComplete) {
      res.status(400).json({ error: `Соберите все карты коллекции «${collection}» (${status.unlockedCards}/${status.totalCards}).` });
      return;
    }
    if (status.isClaimed) {
      res.status(409).json({ error: `Награда за коллекцию «${collection}» уже получена.` });
      return;
    }

    user.claimedCollectionRewards.push(collection);
    user.balance += status.rewardTc;
    user.xp = Math.max(0, Math.round(Number(user.xp) || 0)) + status.rewardXp;
    if (!user.equippedBadgeCollection) {
      user.equippedBadgeCollection = collection;
    }

    recordTx(
      user,
      'collection_bonus',
      status.rewardTc,
      `Сбор коллекции «${collection}»`,
      `+${status.rewardXp} XP · бейдж «${status.badgeTitle}»`
    );
    syncUserAchievements(user);
    saveDb();

    const updatedStatus = evaluateCollectionSetStatus(
      collection,
      db.items,
      user.unlockedItemIds,
      user.claimedCollectionRewards
    );
    res.json({ payload: buildPayload(user.id), reward: updatedStatus });
  });

  app.post('/api/profile/customization', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const { equippedBadgeCollection, showcaseItemIds } = req.body as {
      equippedBadgeCollection?: string | null;
      showcaseItemIds?: string[];
    };

    user.unlockedItemIds ??= [];
    user.claimedCollectionRewards ??= [];

    if (equippedBadgeCollection !== undefined) {
      if (equippedBadgeCollection === null || equippedBadgeCollection === '') {
        user.equippedBadgeCollection = null;
      } else {
        const col = String(equippedBadgeCollection).trim();
        const status = evaluateCollectionSetStatus(
          col,
          db.items,
          user.unlockedItemIds,
          user.claimedCollectionRewards
        );
        if (!status.isComplete) {
          res.status(400).json({ error: `Чтобы надеть бейдж «${status.badgeTitle}», откройте всю коллекцию «${col}».` });
          return;
        }
        user.equippedBadgeCollection = col;
      }
    }

    if (showcaseItemIds !== undefined) {
      if (!Array.isArray(showcaseItemIds)) {
        res.status(400).json({ error: 'Некорректный формат витрины профиля.' });
        return;
      }
      const uniqueIds = [...new Set(showcaseItemIds.filter((id): id is string => typeof id === 'string'))];
      if (uniqueIds.length > 3) {
        res.status(400).json({ error: 'В витрине профиля можно закрепить максимум 3 карточки.' });
        return;
      }
      const unlockedSet = new Set([
        ...user.unlockedItemIds,
        ...user.inventory.map((inv) => inv.itemId),
      ]);
      for (const id of uniqueIds) {
        if (!db.items.some((item) => item.id === id)) {
          res.status(404).json({ error: 'Одна из выбранных карточек не найдена в каталоге.' });
          return;
        }
        if (!unlockedSet.has(id)) {
          res.status(400).json({ error: 'В витрину можно закрепить только уже открытые вами карточки.' });
          return;
        }
      }
      user.showcaseItemIds = uniqueIds;
    }

    saveDb();
    res.json({ payload: buildPayload(user.id) });
  });

  app.post('/api/contracts/craft', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const rawIds = (req.body as { instanceIds?: unknown }).instanceIds;
    const uniqueIds = Array.isArray(rawIds)
      ? [...new Set(rawIds.filter((id): id is string => typeof id === 'string'))]
      : [];

    if (uniqueIds.length !== CONTRACT_REQUIRED_COUNT) {
      res.status(400).json({ error: `Для контракта выберите ровно ${CONTRACT_REQUIRED_COUNT} разных карточек.` });
      return;
    }

    const ownedById = new Map(user.inventory.map((inv) => [inv.instanceId, inv]));
    const selectedEntries = uniqueIds
      .map((id) => ownedById.get(id))
      .filter((entry): entry is InventoryItem => Boolean(entry));

    if (selectedEntries.length !== CONTRACT_REQUIRED_COUNT) {
      res.status(400).json({ error: 'Некоторые выбранные карточки больше не находятся в инвентаре.' });
      return;
    }

    const resolvedItems = selectedEntries.map((entry) => db.items.find((item) => item.id === entry.itemId));
    if (resolvedItems.some((item) => !item)) {
      res.status(400).json({ error: 'Одна из выбранных карточек отсутствует в каталоге.' });
      return;
    }

    const validItems = resolvedItems as ItemCard[];
    const inputRarity = validItems[0].rarity;
    if (validItems.some((item) => item.rarity !== inputRarity)) {
      res.status(400).json({ error: 'Все 7 карт контракта должны иметь одинаковую редкость.' });
      return;
    }

    const targetRarity = getNextContractRarity(inputRarity);
    if (!targetRarity) {
      res.status(400).json({ error: 'Легендарные карты — максимальная редкость и не участвуют в контрактах.' });
      return;
    }

    const outcomes = calculateContractOutcomes(targetRarity, db.items);
    if (outcomes.length === 0) {
      res.status(400).json({ error: 'В каталоге пока нет карточек следующей редкости.' });
      return;
    }

    const consumeSet = new Set(uniqueIds);
    user.inventory = user.inventory.filter((inv) => !consumeSet.has(inv.instanceId));

    const wonItem = pickContractOutcome(outcomes, crypto.randomInt(0, 1_000_000) / 1_000_000);
    const wonInstance: InventoryItem = {
      instanceId: uid('inv'),
      itemId: wonItem.id,
      acquiredAt: Date.now(),
      source: 'contract',
    };
    user.inventory.unshift(wonInstance);

    const xpGained = grantCardDiscovery(user, wonItem.id);
    noteTopDrop(user, wonItem);
    pushLiveDrop(user.username, wonItem.id, 'contract');
    recordTx(
      user,
      'contract_craft',
      0,
      `Контракт 7-в-1 (${inputRarity} → ${targetRarity})`,
      `Получена: ${wonItem.name}`
    );
    syncUserAchievements(user);
    saveDb();

    res.json({
      payload: buildPayload(user.id),
      result: {
        wonItem,
        instance: wonInstance,
        xpGained,
        inputRarity,
        targetRarity,
      },
    });
  });

  app.post('/api/achievements/claim', (req, res) => {
    const user = authenticatedUser(req, res);
    if (!user) return;
    const achievementId = String((req.body as { achievementId?: unknown }).achievementId ?? '').trim() as AchievementId;
    const def = ACHIEVEMENT_DEFINITIONS.find((item) => item.id === achievementId);
    if (!def) {
      res.status(404).json({ error: 'Достижение не найдено.' });
      return;
    }

    syncUserAchievements(user);
    const evaluated = evaluateAchievements(user, db.items).find((entry) => entry.id === achievementId);
    if (!evaluated || !evaluated.unlocked) {
      res.status(400).json({ error: `Условие достижения «${def.title}» ещё не выполнено.` });
      return;
    }
    if (evaluated.claimed) {
      res.status(409).json({ error: `Награда за достижение «${def.title}» уже получена.` });
      return;
    }

    user.claimedAchievementIds = [...new Set([...(user.claimedAchievementIds ?? []), achievementId])];
    user.balance += def.rewardTc;
    user.xp = Math.max(0, Math.round(Number(user.xp) || 0)) + def.rewardXp;
    recordTx(
      user,
      'achievement_reward',
      def.rewardTc,
      `Достижение «${def.title}»`,
      `+${def.rewardXp} XP`
    );
    // Re-run in case achievement XP unlocks "Коллекционер" (Level 10)
    syncUserAchievements(user);
    saveDb();

    const updatedAchievement = evaluateAchievements(user, db.items).find((entry) => entry.id === achievementId);
    res.json({ payload: buildPayload(user.id), claimedAchievement: updatedAchievement });
  });

  app.post('/api/admin/items', (req, res) => {
    if (!adminUser(req, res)) return;
    const { name, rarity, collection, price, imageUrl, caseIds } = req.body as {
      name?: string;
      rarity?: Rarity;
      collection?: string;
      price?: number;
      imageUrl?: string;
      caseIds?: string[];
    };

    const cleanName = (name ?? '').trim();
    const cleanCollection = (collection ?? '').trim() || inferCardCollection(cleanName);
    const numPrice = Math.round(Number(price ?? 0));
    const validRarities: Rarity[] = ['common', 'rare', 'super_rare', 'epic', 'legendary'];

    if (!cleanName || cleanName.length < 2) {
      res.status(400).json({ error: 'Укажите название карты (минимум 2 символа).' });
      return;
    }
    if (!rarity || !validRarities.includes(rarity)) {
      res.status(400).json({ error: 'Выберите корректную редкость.' });
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice < 10) {
      res.status(400).json({ error: 'Цена карты должна быть от 10 Т-коин.' });
      return;
    }
    const rarityPriceBounds: Record<Rarity, [number, number]> = {
      common: [50, 299],
      rare: [300, 799],
      super_rare: [800, 1499],
      epic: [1500, 4999],
      legendary: [5000, 250000],
    };
    const [minRarityPrice, maxRarityPrice] = rarityPriceBounds[rarity];
    if (numPrice < minRarityPrice || numPrice > maxRarityPrice) {
      res.status(400).json({ error: `Для редкости «${rarity}» цена должна быть от ${minRarityPrice} до ${maxRarityPrice} TC.` });
      return;
    }
    if (!imageUrl || !imageUrl.trim()) {
      res.status(400).json({ error: 'Загрузите готовую картинку карты или укажите её URL.' });
      return;
    }

    const storedImage = saveDataUrlImageIfNeeded(imageUrl.trim());
    const newItem: ItemCard = {
      id: uid('card'),
      name: cleanName,
      rarity,
      collection: cleanCollection,
      price: numPrice,
      imageUrl: storedImage,
      createdAt: Date.now(),
    };

    db.items.unshift(newItem);

    if (Array.isArray(caseIds) && caseIds.length > 0) {
      const targetCases = new Set(caseIds);
      for (const c of db.cases) {
        if (targetCases.has(c.id) && !c.itemIds.includes(newItem.id)) {
          c.itemIds.push(newItem.id);
          const caseItems = c.itemIds
            .map((itemId) => db.items.find((item) => item.id === itemId))
            .filter((item): item is ItemCard => Boolean(item));
          c.price = recommendedCasePrice(calculateCaseExpectedValue(c, caseItems));
        }
      }
    }

    saveDb();
    res.json({ item: newItem, items: db.items, cases: db.cases });
  });

  app.delete('/api/admin/items/:id', (req, res) => {
    if (!adminUser(req, res)) return;
    const { id } = req.params;
    const exists = db.items.some((it) => it.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Предмет не найден.' });
      return;
    }
    db.items = db.items.filter((it) => it.id !== id);
    for (const c of db.cases) {
      c.itemIds = c.itemIds.filter((itemId) => itemId !== id);
      const caseItems = c.itemIds
        .map((itemId) => db.items.find((item) => item.id === itemId))
        .filter((item): item is ItemCard => Boolean(item));
      if (caseItems.length >= 2) {
        c.price = recommendedCasePrice(calculateCaseExpectedValue(c, caseItems));
      }
    }
    db.cases = db.cases.filter((caseBox) => caseBox.itemIds.length >= 2);
    for (const u of db.users) {
      u.inventory = u.inventory.filter((inv) => inv.itemId !== id);
      u.unlockedItemIds = (u.unlockedItemIds ?? []).filter((unlockedId) => unlockedId !== id);
      u.showcaseItemIds = (u.showcaseItemIds ?? []).filter((sid) => sid !== id);
    }
    saveDb();
    res.json({ items: db.items, cases: db.cases });
  });

  app.post('/api/admin/grant', (req, res) => {
    if (!adminUser(req, res)) return;
    const { userId, itemId } = req.body as { userId?: string; itemId?: string };
    const user = getUser(userId);
    const item = db.items.find((it) => it.id === itemId);
    if (!item) {
      res.status(404).json({ error: 'Предмет не найден.' });
      return;
    }
    user.inventory.unshift({
      instanceId: uid('inv'),
      itemId: item.id,
      acquiredAt: Date.now(),
      source: 'admin',
    });
    grantCardDiscovery(user, item.id);
    syncUserAchievements(user);
    saveDb();
    res.json({ payload: buildPayload(user.id) });
  });

  app.post('/api/admin/cases', (req, res) => {
    if (!adminUser(req, res)) return;
    const { name, description, price, tier, imageUrl, itemIds, rarityWeights } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      tier?: Rarity;
      imageUrl?: string;
      itemIds?: string[];
      rarityWeights?: Record<Rarity, number>;
    };
    const cleanName = (name ?? '').trim();
    const numPrice = Math.round(Number(price ?? 0));
    if (!cleanName || !Number.isFinite(numPrice) || numPrice < 50 || !Array.isArray(itemIds) || itemIds.length < 2) {
      res.status(400).json({ error: 'Укажите название, цену от 50 TC и минимум 2 предмета для кейса.' });
      return;
    }
    const uniqueItemIds = [...new Set(itemIds)];
    if (uniqueItemIds.length < 2) {
      res.status(400).json({ error: 'Добавьте минимум две разные карточки в дроп кейса.' });
      return;
    }
    const selectedItems = uniqueItemIds.map((id) => db.items.find((item) => item.id === id));
    if (selectedItems.some((item) => !item)) {
      res.status(400).json({ error: 'Кейс содержит карточку, которой нет в каталоге.' });
      return;
    }
    const weights = rarityWeights ?? { common: 35, rare: 30, super_rare: 15, epic: 15, legendary: 5 };
    const validTiers: Rarity[] = ['common', 'rare', 'super_rare', 'epic', 'legendary'];
    if (!validTiers.includes(tier ?? 'epic')) {
      res.status(400).json({ error: 'Выберите допустимый уровень кейса.' });
      return;
    }
    const weightValues = ['common', 'rare', 'super_rare', 'epic', 'legendary'].map((rarity) => Number(weights[rarity as Rarity] ?? 0));
    if (weightValues.some((weight) => !Number.isFinite(weight) || weight < 0) || weightValues.reduce((a, b) => a + b, 0) <= 0) {
      res.status(400).json({ error: 'Шансы редкостей должны быть неотрицательными числами с общей суммой больше нуля.' });
      return;
    }
    const draftCase = { rarityWeights: weights };
    const expectedValue = calculateCaseExpectedValue(draftCase, selectedItems as ItemCard[]);
    const fairMinimumPrice = recommendedCasePrice(expectedValue);
    if (numPrice < fairMinimumPrice) {
      res.status(400).json({ error: `Цена кейса должна быть не ниже ${fairMinimumPrice} TC, чтобы средняя выплата оставалась в пределах заданной экономики.` });
      return;
    }
    const storedImage = saveDataUrlImageIfNeeded(
      (imageUrl ?? '/src/assets/images/case_legend_crate_1794514881507.jpg').trim()
    );
    const newCase: CaseBox = {
      id: uid('case'),
      name: cleanName,
      description: (description ?? 'Кастомный кейс, созданный администратором.').trim(),
      price: numPrice,
      tier: tier ?? 'epic',
      imageUrl: storedImage,
      itemIds: uniqueItemIds,
      rarityWeights: weights,
    };
    db.cases.unshift(newCase);
    saveDb();
    res.json({ caseBox: newCase, cases: db.cases });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const webSockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
    if (pathname !== '/ws') return;
    const token = extractSessionCookie(request as unknown as express.Request);
    const userId = verifySessionToken(token);
    if (!userId || !db.users.some((user) => user.id === userId)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (ws) => {
      const connections = socketsByUser.get(userId) ?? new Set<WebSocket>();
      connections.add(ws); socketsByUser.set(userId, connections);
      ws.send(JSON.stringify({ type: 'connected' }));
      ws.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as { type?: string; roomId?: string };
          if (message.type === 'subscribe_battle' && message.roomId) {
            const room = db.battles.find((entry) => entry.id === message.roomId);
            if (room && (room.hostUserId === userId || room.guestUserId === userId)) {
              ws.send(JSON.stringify({ type: 'battle_state', roomId: room.id, payload: publicBattle(room, userId) }));
            }
          }
        } catch { /* Ignore malformed client messages. */ }
      });
      ws.on('close', () => {
        connections.delete(ws);
        if (!connections.size) socketsByUser.delete(userId);
      });
    });
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CARDUP server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

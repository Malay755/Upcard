import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';
import { Pool, type PoolClient } from 'pg';
import { createServer as createViteServer } from 'vite';
import type {
  BootstrapPayload,
  CaseBox,
  FriendProfile,
  FriendSummary,
  InventoryItem,
  ItemCard,
  LiveDropEntry,
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
  sessionSecret?: string;
  revokedTokens?: string[];
  authVersion?: number;
  economyVersion?: number;
  consumedTelegramHashes?: { hash: string; expiresAt: number }[];
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
      price: 360,
      imageUrl: '/assets/aistudio/____________b668a6c6.png',
      createdAt: now - 86400000 * 6,
    },
    {
      id: 'card_hustler_artemiy',
      name: 'Хастлер Артемий',
      rarity: 'rare',
      price: 580,
      imageUrl: '/assets/aistudio/____________c19dd8da.png',
      createdAt: now - 86400000 * 5,
    },
    {
      id: 'card_down_timur',
      name: 'Даун Тимур',
      rarity: 'epic',
      price: 1500,
      imageUrl: '/assets/aistudio/____________5ef8ef47.png',
      createdAt: now - 86400000 * 4,
    },
    {
      id: 'card_kiri_chan',
      name: 'Кири-тян',
      rarity: 'epic',
      price: 1850,
      imageUrl: '/assets/aistudio/____________f6f0617f.png',
      createdAt: now - 86400000 * 3,
    },
    {
      id: 'card_usaty_vanya',
      name: 'Усатый Ваня',
      rarity: 'epic',
      price: 2400,
      imageUrl: '/assets/aistudio/____________366eede1.png',
      createdAt: now - 86400000 * 2,
    },
    {
      id: 'card_jopa_michaela',
      name: 'Жопа Майкла',
      rarity: 'epic',
      price: 2900,
      imageUrl: '/assets/aistudio/____________9e93982f.png',
      createdAt: now - 86400000 * 1,
    },
    {
      id: 'card_timur_volga',
      name: 'Тимур на Волге',
      rarity: 'legendary',
      price: 6200,
      imageUrl: '/assets/aistudio/____________ae346142.png',
      createdAt: now - 3600000 * 18,
    },
    {
      id: 'card_vanya_dripchik',
      name: 'Ваня Дрипчик',
      rarity: 'legendary',
      price: 9500,
      imageUrl: '/assets/aistudio/____________2942f215.png',
      createdAt: now - 3600000 * 12,
    },
    {
      id: 'card_tenet_t4',
      name: 'TENET T4',
      rarity: 'legendary',
      price: 14500,
      imageUrl: '/assets/aistudio/____________7bcb17dc.png',
      createdAt: now - 3600000 * 6,
    },
  ];

  const cases: CaseBox[] = [
    {
      id: 'case_starter',
      name: 'Зелёный Старт',
      description: 'Входной кейс с карточками Артемия и шансом выбить эпический фиолетовый дроп.',
      price: 390,
      tier: 'rare',
      imageUrl: '/src/assets/images/case_epic_crate_1794514882592.jpg',
      itemIds: ['card_artemiy_daun', 'card_hustler_artemiy', 'card_down_timur', 'card_kiri_chan'],
      rarityWeights: { common: 0, rare: 78, epic: 22, legendary: 0 },
    },
    {
      id: 'case_hustle',
      name: 'Ночной Хастл',
      description: 'Изумрудный хастл-микс со ставкой на Дауна Тимура, Кири-тян и Усатого Ваню.',
      price: 690,
      tier: 'rare',
      imageUrl: '/src/assets/images/case_epic_crate_1794514882592.jpg',
      itemIds: [
        'card_artemiy_daun',
        'card_hustler_artemiy',
        'card_down_timur',
        'card_kiri_chan',
        'card_usaty_vanya',
      ],
      rarityWeights: { common: 0, rare: 62, epic: 38, legendary: 0 },
    },
    {
      id: 'case_cosmos',
      name: 'Космос Сквад',
      description: 'Баланс редких и эпических карт сквада с шансом сорвать золотого Тимура на Волге.',
      price: 1450,
      tier: 'epic',
      imageUrl: '/src/assets/images/case_epic_crate_1794514882592.jpg',
      itemIds: [
        'card_artemiy_daun',
        'card_hustler_artemiy',
        'card_down_timur',
        'card_kiri_chan',
        'card_usaty_vanya',
        'card_jopa_michaela',
        'card_timur_volga',
      ],
      rarityWeights: { common: 0, rare: 34, epic: 56, legendary: 10 },
    },
    {
      id: 'case_drip_legend',
      name: 'Дрип Легенд',
      description: 'Флагманский золотой кейс с повышенным шансом на Тимура на Волге и Ваню Дрипчика.',
      price: 3200,
      tier: 'legendary',
      imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
      itemIds: [
        'card_hustler_artemiy',
        'card_down_timur',
        'card_usaty_vanya',
        'card_jopa_michaela',
        'card_timur_volga',
        'card_vanya_dripchik',
      ],
      rarityWeights: { common: 0, rare: 18, epic: 52, legendary: 30 },
    },
    {
      id: 'case_tenet_vip',
      name: 'TENET Автосалон VIP',
      description: 'Элитный кейс только с эпиками и всеми тремя золотыми легендами, включая TENET T4.',
      price: 5400,
      tier: 'legendary',
      imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
      itemIds: [
        'card_kiri_chan',
        'card_usaty_vanya',
        'card_jopa_michaela',
        'card_timur_volga',
        'card_vanya_dripchik',
        'card_tenet_t4',
      ],
      rarityWeights: { common: 0, rare: 0, epic: 54, legendary: 46 },
    },
    {
      id: 'case_custom_artemiy',
      name: 'Артемий на районе',
      description: 'Авторский кейс с фокусом на зелёную серию Артемия и быстрый разгон банка.',
      price: 450,
      tier: 'rare',
      imageUrl: '/src/assets/images/case_epic_crate_1794514882592.jpg',
      itemIds: ['card_artemiy_daun', 'card_hustler_artemiy', 'card_down_timur', 'card_usaty_vanya'],
      rarityWeights: { common: 0, rare: 74, epic: 26, legendary: 0 },
    },
    {
      id: 'case_custom_timur',
      name: 'Закат на Волге',
      description: 'Авторская охота за золотой картой «Тимур на Волге» с эпическим прикрытием.',
      price: 1950,
      tier: 'epic',
      imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
      itemIds: ['card_hustler_artemiy', 'card_down_timur', 'card_jopa_michaela', 'card_timur_volga'],
      rarityWeights: { common: 0, rare: 26, epic: 54, legendary: 20 },
    },
    {
      id: 'case_custom_purple',
      name: 'Фиолетовый вайб',
      description: 'Концентрированный эпик-кейс: Даун Тимур, Кири-тян, Усатый Ваня и Жопа Майкла.',
      price: 1750,
      tier: 'epic',
      imageUrl: '/src/assets/images/case_epic_crate_1794514882592.jpg',
      itemIds: [
        'card_hustler_artemiy',
        'card_down_timur',
        'card_kiri_chan',
        'card_usaty_vanya',
        'card_jopa_michaela',
      ],
      rarityWeights: { common: 0, rare: 20, epic: 80, legendary: 0 },
    },
    {
      id: 'case_custom_vanya',
      name: 'Секрет Вани (EZ)',
      description: 'Ультра-рисковый авторский кейс с повышенным шансом выбить Ваню Дрипчика.',
      price: 4200,
      tier: 'legendary',
      imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
      itemIds: ['card_kiri_chan', 'card_usaty_vanya', 'card_timur_volga', 'card_vanya_dripchik'],
      rarityWeights: { common: 0, rare: 0, epic: 62, legendary: 38 },
    },
    {
      id: 'case_custom_oligarch',
      name: 'Золотой Олимп',
      description: 'Высокие ставки ради топового автопарка TENET T4 и всей золотой коллекции.',
      price: 6800,
      tier: 'legendary',
      imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
      itemIds: [
        'card_usaty_vanya',
        'card_jopa_michaela',
        'card_timur_volga',
        'card_vanya_dripchik',
        'card_tenet_t4',
      ],
      rarityWeights: { common: 0, rare: 0, epic: 45, legendary: 55 },
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
  const normalizedUsers = existingUsers.map((user) => {
    let friendCode = user.friendCode?.toUpperCase();
    if (!friendCode || usedFriendCodes.has(friendCode)) friendCode = createFriendCode([...existingUsers]);
    usedFriendCodes.add(friendCode);
    const topDrop = inferTopDrop(user, Array.isArray(parsed.items) ? parsed.items : seed.items, loadedUpgradeHistory, loadedTransactions);
    return {
      ...user,
      friendCode,
      friends: Array.isArray(user.friends) ? user.friends : [],
      topDropItemId: user.topDropItemId || topDrop?.id || null,
      topDropPrice: Math.max(Number(user.topDropPrice) || 0, topDrop?.price ?? 0),
    };
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
    consumedTelegramHashes: Array.isArray(parsed.consumedTelegramHashes) ? parsed.consumedTelegramHashes : [],
  };

  if ((parsed.economyVersion ?? 0) < 2) {
    for (const caseBox of normalized.cases) {
      const caseItems = caseBox.itemIds
        .map((id) => normalized.items.find((item) => item.id === id))
        .filter((item): item is ItemCard => Boolean(item));
      const fairPrice = recommendedCasePrice(calculateCaseExpectedValue(caseBox, caseItems));
      if (fairPrice > 0) caseBox.price = fairPrice;
    }
    normalized.economyVersion = 2;
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

function pushLiveDrop(userName: string, itemId: string, source: 'upgrade' | 'case', multiplier?: number) {
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

function setSessionCookie(res: express.Response, token: string) {
  res.cookie('cardup_tg_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
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
      inventory: [
        { instanceId: uid('inv'), itemId: 'card_artemiy_daun', acquiredAt: Date.now(), source: 'starter' },
      ],
      createdAt: Date.now(),
    };
    db.users.push(user);
    recordTx(user, 'welcome_bonus', 500, 'Стартовый игровой бонус');
  } else {
    if (tgId) user.telegramId = tgId;
    if (cleanHandle) user.telegramUsername = cleanHandle;
    if (cleanDisplay) user.telegramFirstName = cleanDisplay;
    if (params.photoUrl) user.telegramPhotoUrl = params.photoUrl;
    user.authProvider = params.provider;
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
  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));
  usePostgresState(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storage: postgresPool ? 'postgres' : 'local' });
  });

  const telegramBotToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
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
    user.friends.push(friend.id);
    friend.friends.push(user.id);
    saveDb();
    res.json({ payload: buildPayload(user.id), addedFriendId: friend.id });
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
    const profile: FriendProfile = {
      id: friend.id,
      username: friend.username,
      telegramUsername: friend.telegramUsername,
      telegramPhotoUrl: friend.telegramPhotoUrl,
      avatarColor: friend.avatarColor,
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
    res.clearCookie('cardup_tg_session', { path: '/' });
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
    setSessionCookie(res, sessionToken);
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
    setSessionCookie(res, sessionToken);
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

  app.post('/api/finance/deposit', (req, res) => {
    res.status(503).json({
      error: 'Пополнение временно недоступно: на сайте ещё не подключён платёжный провайдер. Баланс можно получать за игровые активности.',
    });
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
    if (won) {
      user.wonUpgrades += 1;
      wonInstance = {
        instanceId: uid('inv'),
        itemId: targetItem.id,
        acquiredAt: Date.now(),
        source: 'upgrade',
      };
      user.inventory.unshift(wonInstance);
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

    saveDb();
    res.json({
      payload: buildPayload(user.id),
      result: {
        won,
        rollValue,
        odds,
        targetItem,
        wonInstance,
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
    noteTopDrop(user, wonItem);

    recordTx(user, 'case_open', -caseBox.price, `Открытие кейса «${caseBox.name}»`, `Выпал: ${wonItem.name}`);
    pushLiveDrop(user.username, wonItem.id, 'case');
    saveDb();

    res.json({
      payload: buildPayload(user.id),
      drop: {
        item: wonItem,
        instance: wonInstance,
        probabilities: probs,
      },
    });
  });

  app.post('/api/admin/items', (req, res) => {
    if (!adminUser(req, res)) return;
    const { name, rarity, price, imageUrl, caseIds } = req.body as {
      name?: string;
      rarity?: Rarity;
      price?: number;
      imageUrl?: string;
      caseIds?: string[];
    };

    const cleanName = (name ?? '').trim();
    const numPrice = Math.round(Number(price ?? 0));
    const validRarities: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

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
      rare: [300, 999],
      epic: [1000, 4999],
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
    const weights = rarityWeights ?? { common: 40, rare: 35, epic: 20, legendary: 5 };
    const validTiers: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
    if (!validTiers.includes(tier ?? 'epic')) {
      res.status(400).json({ error: 'Выберите допустимый уровень кейса.' });
      return;
    }
    const weightValues = ['common', 'rare', 'epic', 'legendary'].map((rarity) => Number(weights[rarity as Rarity] ?? 0));
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CARDUP server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

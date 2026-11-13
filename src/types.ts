export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type RollMode = 'under' | 'over';

export type AppTab = 'upgrade' | 'cases' | 'bonuses' | 'profile' | 'admin';

export interface ItemCard {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  imageUrl: string;
  createdAt: number;
}

export interface InventoryItem {
  instanceId: string;
  itemId: string;
  acquiredAt: number;
  source: 'starter' | 'upgrade' | 'case' | 'admin';
}

export interface CaseBox {
  id: string;
  name: string;
  description: string;
  price: number;
  tier: Rarity;
  imageUrl: string;
  itemIds: string[];
  rarityWeights: Record<Rarity, number>;
}

export type TransactionType =
  | 'deposit'
  | 'case_open'
  | 'item_sell'
  | 'upgrade_stake'
  | 'upgrade_win'
  | 'daily_bonus'
  | 'referral_bonus'
  | 'referral_commission';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  meta?: string;
  createdAt: number;
}

export interface UpgradeHistoryEntry {
  id: string;
  userId: string;
  stakeItemIds: string[];
  stakeBalanceAdded: number;
  stakeTotal: number;
  targetItemId: string;
  targetPrice: number;
  winChance: number;
  multiplier: number;
  rollMode: RollMode;
  rollValue: number;
  won: boolean;
  createdAt: number;
}

export interface LiveDropEntry {
  id: string;
  userName: string;
  itemId: string;
  source: 'upgrade' | 'case';
  multiplier?: number;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  telegramId?: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramPhotoUrl?: string;
  authProvider?: 'telegram_widget' | 'telegram_webapp';
  avatarColor: string;
  balance: number;
  referralCode: string;
  referredByCode: string | null;
  referralCount: number;
  referralEarned: number;
  dailyStreak: number;
  lastDailyClaimAt: number | null;
  totalDeposited: number;
  totalUpgrades: number;
  wonUpgrades: number;
  totalCasesOpened: number;
  inventory: InventoryItem[];
  createdAt: number;
}

export interface TelegramAuthConfig {
  botConfigured: boolean;
  botUsername: string | null;
}

export interface BootstrapPayload {
  user: UserProfile;
  users: Pick<UserProfile, 'id' | 'username' | 'telegramUsername' | 'balance' | 'referralCode'>[];
  items: ItemCard[];
  cases: CaseBox[];
  transactions: Transaction[];
  upgradeHistory: UpgradeHistoryEntry[];
  liveDrops: LiveDropEntry[];
  authenticated?: boolean;
}

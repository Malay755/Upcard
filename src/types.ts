export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type RollMode = 'under' | 'over';

export type AppTab = 'upgrade' | 'cases' | 'battles' | 'bonuses' | 'profile';
export type BattleMode = 'cases' | 'upgrade';
export type BattleStatus = 'waiting' | 'completed' | 'cancelled';

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
  source: 'starter' | 'upgrade' | 'case' | 'admin' | 'battle';
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
  | 'welcome_bonus'
  | 'manual_credit'
  | 'deposit'
  | 'case_open'
  | 'item_sell'
  | 'upgrade_stake'
  | 'upgrade_win'
  | 'battle_stake'
  | 'battle_win'
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

export interface FriendSummary {
  id: string;
  username: string;
  telegramUsername?: string;
  telegramPhotoUrl?: string;
  avatarColor: string;
  totalUpgrades: number;
  wonUpgrades: number;
  totalCasesOpened: number;
  topDropItemId: string | null;
  topDropPrice: number;
}

export interface FriendProfile {
  id: string;
  username: string;
  telegramUsername?: string;
  telegramPhotoUrl?: string;
  avatarColor: string;
  totalUpgrades: number;
  wonUpgrades: number;
  totalCasesOpened: number;
  topDrop: ItemCard | null;
  topDropPrice: number;
  inventory: { item: ItemCard; acquiredAt: number }[];
  createdAt: number;
}

export interface FriendRequestSummary {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromTelegramUsername?: string;
  fromPhotoUrl?: string;
  createdAt: number;
}

export interface BattleInvitationSummary {
  id: string;
  roomId: string;
  fromUsername: string;
  mode: BattleMode;
  caseId?: string;
  caseCount?: number;
  createdAt: number;
}

export interface BattleRoomSummary {
  id: string;
  mode: BattleMode;
  status: BattleStatus;
  hostUserId: string;
  hostUsername: string;
  hostAvatarUrl?: string;
  hostAvatarColor?: string;
  guestUserId: string | null;
  guestUsername: string | null;
  guestAvatarUrl?: string;
  guestAvatarColor?: string;
  hasPassword: boolean;
  caseId?: string;
  caseName?: string;
  caseCount?: number;
  hostStakeValue: number;
  guestStakeValue: number;
  createdAt: number;
  startedAt?: number;
  durationMs?: number;
  winnerUserId?: string | null;
  hostWinChance?: number;
  rollValue?: number;
  roundResults?: { round: number; hostDrop: ItemCard; guestDrop: ItemCard }[];
  rewardInventoryIds?: string[];
  hostItems?: InventoryItem[];
  guestItems?: InventoryItem[];
}

export interface RealtimeEvent {
  type: string;
  roomId?: string;
  round?: number;
  payload?: unknown;
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
  friendCode: string;
  friends: string[];
  topDropItemId: string | null;
  topDropPrice: number;
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
  friends: FriendSummary[];
  friendRequestsReceived: FriendRequestSummary[];
  battleInvitations: BattleInvitationSummary[];
  authenticated?: boolean;
}

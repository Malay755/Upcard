export type Rarity = 'common' | 'rare' | 'super_rare' | 'epic' | 'legendary';

export type RollMode = 'under' | 'over';

export type AppTab = 'upgrade' | 'contracts' | 'cases' | 'battles' | 'games' | 'bonuses' | 'profile';
export type BattleMode = 'cases' | 'upgrade';
export type BattleStatus = 'waiting' | 'completed' | 'cancelled';
export type MinigameId = 'harvest' | 'mines' | 'race';

export type DurakSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type DurakRank = 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type DurakMode = 'podkidnoy' | 'perevodnoy';
export type DurakRoomStatus = 'waiting' | 'playing' | 'completed' | 'cancelled';
export type DurakBoutPhase = 'playing' | 'taking';

export interface DurakCard {
  id: string;
  itemId: string;
  name: string;
  suit: DurakSuit;
  rank: DurakRank;
  imageUrl: string;
}

export interface DurakTablePair {
  attack: DurakCard;
  defense: DurakCard | null;
}

export interface DurakPlayerPublic {
  userId: string;
  username: string;
  avatarUrl?: string;
  avatarColor?: string;
  seatIndex: number;
  cardCount: number;
  passed: boolean;
  finishedRank: number | null;
}

export interface DurakRoomSummary {
  id: string;
  mode: DurakMode;
  status: DurakRoomStatus;
  maxPlayers: number;
  stake: number;
  hasPassword: boolean;
  hostUserId: string;
  hostUsername: string;
  players: DurakPlayerPublic[];
  createdAt: number;
  startedAt?: number;
}

export interface DurakRoomProjection extends DurakRoomSummary {
  trumpSuit: DurakSuit | null;
  trumpCard: DurakCard | null;
  deckCount: number;
  discardCount: number;
  table: DurakTablePair[];
  phase: DurakBoutPhase;
  attackerIndex: number;
  defenderIndex: number;
  turnDeadlineAt: number | null;
  myHand: DurakCard[];
  winnerUserIds: string[];
  loserUserId: string | null;
  isDraw: boolean;
  pot: number;
  payoutPerWinner: number;
  lastActionText?: string;
}

export interface DurakInvitationSummary {
  id: string;
  roomId: string;
  fromUsername: string;
  mode: DurakMode;
  stake: number;
  maxPlayers: number;
  createdAt: number;
}

export interface MinigameEnergySlot {
  charges: number;
  maxCharges: number;
  nextRechargeAt: number | null;
  bestScore: number;
  playsCount: number;
}

export type MinigameStatusMap = Record<MinigameId, MinigameEnergySlot>;

export interface MinesBoardState {
  sessionId: string;
  gridSize: number;
  minesCount: number;
  revealedSafe: number[];
  mineLocations?: number[];
  currentBank: number;
  nextStepBonus: number;
  status: 'playing' | 'cashed_out' | 'busted';
}

export interface ItemCard {
  id: string;
  name: string;
  rarity: Rarity;
  collection?: string;
  price: number;
  imageUrl: string;
  createdAt: number;
  durakSuit?: DurakSuit;
  durakRank?: DurakRank;
  durakImageUrl?: string;
}

export interface InventoryItem {
  instanceId: string;
  itemId: string;
  acquiredAt: number;
  source: 'starter' | 'upgrade' | 'case' | 'admin' | 'battle' | 'contract';
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
  | 'durak_stake'
  | 'durak_win'
  | 'daily_bonus'
  | 'referral_bonus'
  | 'referral_commission'
  | 'collection_bonus'
  | 'contract_craft'
  | 'achievement_reward'
  | 'minigame_harvest'
  | 'minigame_mines'
  | 'minigame_race';

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
  source: 'upgrade' | 'case' | 'contract';
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

export type AchievementId =
  | 'ACH_UPG_SNIPER'
  | 'ACH_UPG_LOSE_STREAK'
  | 'ACH_UPG_MULTI_WIN'
  | 'ACH_DIARY_HALF'
  | 'ACH_DIARY_FIRST_SET'
  | 'ACH_DIARY_LEVEL_10'
  | 'ACH_CASE_LEGEND'
  | 'ACH_BATTLE_FIRST_WIN'
  | 'ACH_SOCIAL_SQUAD';

export type AchievementCategory = 'upgrades' | 'collection' | 'cases_social';

export interface UserAchievementStats {
  upgradeWinStreak: number;
  maxUpgradeWinStreak: number;
  upgradeLoseStreak: number;
  maxUpgradeLoseStreak: number;
  lowChanceUpgradeWin: boolean;
  legendaryCaseDrop: boolean;
  battleWins: number;
}

export interface FriendProfile {
  id: string;
  username: string;
  telegramUsername?: string;
  telegramPhotoUrl?: string;
  avatarColor: string;
  xp?: number;
  equippedBadgeCollection?: string | null;
  showcaseItems?: ItemCard[];
  unlockedAchievementsCount?: number;
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
  xp: number;
  unlockedItemIds: string[];
  claimedCollectionRewards: string[];
  equippedBadgeCollection: string | null;
  showcaseItemIds: string[];
  unlockedAchievementIds: AchievementId[];
  claimedAchievementIds: AchievementId[];
  achievementStats?: UserAchievementStats;
  minigameEnergy?: Record<MinigameId, {
    charges: number;
    lastRechargeAt: number;
    dayKey?: string;
    bestScore: number;
    playsCount: number;
  }>;
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
  durakInvitations?: DurakInvitationSummary[];
  minigames?: MinigameStatusMap;
  authenticated?: boolean;
}

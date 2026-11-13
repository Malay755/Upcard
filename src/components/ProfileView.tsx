import React, { useMemo, useState } from 'react';
import { Copy, Crown, ExternalLink, Users, UserMinus, UserPlus, X, Coins, LayoutGrid, ShieldCheck, Wallet } from 'lucide-react';
import type {
  BootstrapPayload,
  FriendProfile,
  FriendRequestSummary,
  FriendSummary,
  ItemCard,
  Rarity,
  TransactionType,
  UserProfile,
} from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import { formatTC, RARITY_LABELS } from '../utils/economics';
import { soundFX } from '../utils/sound';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';

interface ProfileViewProps {
  user: UserProfile;
  isAuthorized: boolean;
  items: ItemCard[];
  transactions: BootstrapPayload['transactions'];
  upgradeHistory: BootstrapPayload['upgradeHistory'];
  friends: FriendSummary[];
  friendRequestsReceived: FriendRequestSummary[];
  friendInviteNotice: string;
  onOpenTelegramLogin: () => void;
  onSellItems: (instanceIds: string[]) => Promise<void>;
  onOpenDeposit: () => void;
  onGoToUpgrade: () => void;
  onAddFriend: (code: string) => Promise<BootstrapPayload>;
  onAcceptFriendRequest: (id: string) => Promise<void>;
  onDeclineFriendRequest: (id: string) => Promise<void>;
  onRemoveFriend: (friendId: string) => Promise<void>;
  onGetFriendProfile: (friendId: string) => Promise<FriendProfile>;
}

const TX_LABELS: Record<TransactionType, string> = {
  manual_credit: 'Временное начисление',
  welcome_bonus: 'Стартовый бонус',
  deposit: 'Пополнение',
  case_open: 'Открытие кейса',
  item_sell: 'Продажа карточки',
  upgrade_stake: 'Ставка в апгрейд',
  upgrade_win: 'Выигрыш апгрейда',
  battle_stake: 'Ставка в батле',
  battle_win: 'Выигрыш в батле',
  daily_bonus: 'Ежедневный бонус',
  referral_bonus: 'Реферальный бонус',
  referral_commission: 'Реферальная комиссия 5%',
};

const RARITY_TILE_ACCENT: Record<Rarity, { bar: string; glow: string }> = {
  common: { bar: 'bg-slate-400', glow: 'from-slate-400/15' },
  rare: { bar: 'bg-emerald-400', glow: 'from-emerald-500/20' },
  epic: { bar: 'bg-purple-400', glow: 'from-purple-500/20' },
  legendary: { bar: 'bg-[#FACC15]', glow: 'from-amber-400/25' },
};

const ProfileInventoryTile: React.FC<{
  item: ItemCard;
  onSell: () => void;
}> = ({ item, onSell }) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  const style = RARITY_TILE_ACCENT[item.rarity] ?? RARITY_TILE_ACCENT.common;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-white/[0.06] p-3 flex flex-col justify-between bg-gradient-to-b ${style.glow} via-[#181B22] to-[#121419]`}
    >
      <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${style.bar}`} />

      <div className="relative z-10 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-bold text-[#FACC15]">
          <span>{formatTC(item.price)}</span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] text-[#0B0D10] text-[7px] font-black inline-flex items-center justify-center">
            T
          </span>
        </span>
        <span className="text-[9px] text-slate-400">{RARITY_LABELS[item.rarity]}</span>
      </div>

      <div className="relative flex items-center justify-center my-2 h-24">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-24 w-auto object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.75)]"
          />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-white text-center truncate">{item.name}</div>
        <button
          type="button"
          onClick={onSell}
          className="w-full py-1.5 rounded-lg bg-[#0D0F12] hover:bg-emerald-500/20 border border-white/[0.06] hover:border-emerald-400/35 text-[11px] font-semibold text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          <Coins className="w-3 h-3" />
          <span>Продать</span>
        </button>
      </div>
    </div>
  );
};

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  isAuthorized,
  items,
  transactions,
  upgradeHistory,
  friends,
  friendRequestsReceived,
  friendInviteNotice,
  onOpenTelegramLogin,
  onSellItems,
  onOpenDeposit,
  onGoToUpgrade,
  onAddFriend,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onRemoveFriend,
  onGetFriendProfile,
}) => {
  const [historyTab, setHistoryTab] = useState<'ledger' | 'upgrades'>('ledger');
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [friendMessage, setFriendMessage] = useState('');
  const [friendLoading, setFriendLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);

  const itemsMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const inventoryEntries = useMemo(() => {
    return user.inventory
      .map((inv) => ({ inv, item: itemsMap.get(inv.itemId) }))
      .filter((x): x is { inv: typeof user.inventory[number]; item: ItemCard } => Boolean(x.item));
  }, [user.inventory, itemsMap]);

  const inventoryTotalValue = useMemo(
    () => inventoryEntries.reduce((sum, x) => sum + x.item.price, 0),
    [inventoryEntries]
  );
  const topDrop = user.topDropItemId ? itemsMap.get(user.topDropItemId) : undefined;
  const inviteLink = `${window.location.origin}/?friend=${encodeURIComponent(user.friendCode)}`;

  const winRate =
    user.totalUpgrades > 0
      ? ((user.wonUpgrades / user.totalUpgrades) * 100).toFixed(1)
      : '0.0';

  const handleSellAll = async () => {
    if (inventoryEntries.length === 0) return;
    await onSellItems(inventoryEntries.map((e) => e.inv.instanceId));
    soundFX.playCoin();
  };

  const handleAddFriend = async (event: React.FormEvent) => {
    event.preventDefault();
    setFriendLoading(true);
    setFriendMessage('');
    try {
      await onAddFriend(friendCodeInput);
      setFriendCodeInput('');
      setFriendMessage('Запрос отправлен. Друг появится в списке после согласия.');
    } catch (error) {
      setFriendMessage(error instanceof Error ? error.message : 'Не удалось добавить друга.');
    } finally {
      setFriendLoading(false);
    }
  };

  const handleFriendRequestChoice = async (id: string, accept: boolean) => {
    setFriendLoading(true);
    try {
      if (accept) await onAcceptFriendRequest(id);
      else await onDeclineFriendRequest(id);
      setFriendMessage(accept ? 'Запрос принят. Вы теперь друзья.' : 'Запрос отклонён.');
    } catch (error) {
      setFriendMessage(error instanceof Error ? error.message : 'Не удалось обработать запрос.');
    } finally {
      setFriendLoading(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setFriendMessage('Ссылка-приглашение скопирована.');
    } catch {
      setFriendMessage('Не удалось скопировать ссылку. Скопируйте её вручную из поля выше.');
    }
  };

  const openFriendProfile = async (friendId: string) => {
    setFriendLoading(true);
    try {
      setSelectedFriend(await onGetFriendProfile(friendId));
    } catch (error) {
      setFriendMessage(error instanceof Error ? error.message : 'Не удалось открыть профиль.');
    } finally {
      setFriendLoading(false);
    }
  };

  // Unauthorized Telegram gate matching Upgrader inventory panel
  if (!isAuthorized) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center gap-2 pt-1">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#FACC15]" fill="currentColor" aria-hidden="true">
            <path d="M12 4L4 11.5L6.2 13.7L12 8.2L17.8 13.7L20 11.5L12 4Z" />
            <path d="M12 10.5L4 18L6.2 20.2L12 14.7L17.8 20.2L20 18L12 10.5Z" opacity="0.6" />
          </svg>
          <h1 className="text-xl font-display font-black tracking-wider uppercase text-white">
            ПРОФИЛЬ
          </h1>
        </div>

        <section className="max-w-xl mx-auto bg-[#14161A] border border-white/[0.06] rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#2AABEE]/15 border border-[#2AABEE]/30 text-[#2AABEE] flex items-center justify-center">
            <TelegramPaperPlaneIcon className="w-6 h-6 -translate-x-0.5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-display font-bold text-white">You are not authorized</h2>
            <p className="text-xs text-slate-400">
              Войдите через Telegram, чтобы открыть личный профиль, статистику, инвентарь и интеграцию с ботом
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenTelegramLogin}
            className="inline-flex items-center gap-2.5 px-7 py-2.5 rounded-full bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-all cursor-pointer shadow-[0_0_24px_rgba(250,204,21,0.2)]"
          >
            <span>Login via Telegram</span>
            <TelegramPaperPlaneIcon className="w-4 h-4" />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Centered Hero Title matching UPGRADER */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#FACC15]" fill="currentColor" aria-hidden="true">
          <path d="M12 4L4 11.5L6.2 13.7L12 8.2L17.8 13.7L20 11.5L12 4Z" />
          <path d="M12 10.5L4 18L6.2 20.2L12 14.7L17.8 20.2L20 18L12 10.5Z" opacity="0.6" />
        </svg>
        <h1 className="text-xl font-display font-black tracking-wider uppercase text-white">
          ПРОФИЛЬ
        </h1>
      </div>

      {/* Top Profile Header + player statistics */}
      <section
        className="border border-white/[0.06] rounded-xl p-5 sm:p-6 overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 55% at 20% 0%, rgba(250, 204, 21, 0.08) 0%, rgba(20, 22, 26, 0.96) 72%)',
          backgroundColor: '#14161A',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {user.telegramPhotoUrl ? (
              <img
                src={user.telegramPhotoUrl}
                alt={user.username}
                className="w-14 h-14 rounded-xl object-cover border border-[#FACC15]/40 shrink-0"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-display font-extrabold text-[#0B0D10] shrink-0"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.username.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-display font-bold text-white">{user.username}</h2>
                {user.telegramUsername && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2AABEE]/15 border border-[#2AABEE]/30 text-[11px] font-medium text-[#2AABEE]">
                    <TelegramPaperPlaneIcon className="w-3 h-3" />
                    @{user.telegramUsername}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-num text-slate-400">
                <span>TG ID: {user.telegramId || '—'}</span>
                <span>·</span>
                <span>Реф. код: {user.referralCode}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenDeposit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-colors cursor-pointer shadow-[0_0_20px_rgba(250,204,21,0.18)]"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Пополнить</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 mt-5 pt-5 border-t border-white/[0.06]">
          <div className="relative overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-[#FACC15]" />
            <div className="text-[11px] text-slate-400">Баланс</div>
            <div className="text-xl font-mono-num font-bold text-[#FACC15] mt-1">
              {formatTC(user.balance)} TC
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-purple-400" />
            <div className="text-[11px] text-slate-400">Инвентарь ({inventoryEntries.length})</div>
            <div className="text-xl font-mono-num font-bold text-white mt-1">
              {formatTC(inventoryTotalValue)} TC
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-emerald-400" />
            <div className="text-[11px] text-slate-400">Винрейт апгрейдов</div>
            <div className="text-xl font-mono-num font-bold text-emerald-400 mt-1">
              {winRate}%{' '}
              <span className="text-xs text-slate-400 font-normal">
                ({user.wonUpgrades}/{user.totalUpgrades})
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-slate-400" />
            <div className="text-[11px] text-slate-400">Кейсов открыто</div>
            <div className="text-xl font-mono-num font-bold text-white mt-1">
              {user.totalCasesOpened}
            </div>
          </div>
          <div className="relative min-w-0 overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-amber-300" />
            <div className="text-[11px] text-slate-400">Топ-дроп</div>
            {topDrop ? (
              <div className="mt-1 flex items-center gap-2">
                <img src={topDrop.imageUrl} alt="" className="h-9 w-10 shrink-0 object-contain" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-white" title={topDrop.name}>{topDrop.name}</div>
                  <div className="text-sm font-mono-num font-bold text-amber-200">{formatTC(user.topDropPrice)} TC</div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">Пока нет выпадений</div>
            )}
          </div>
          <div className="relative overflow-hidden bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
            <span aria-hidden="true" className="absolute top-0 inset-x-0 h-[2px] bg-cyan-400" />
            <div className="text-[11px] text-slate-400">Апгрейдов совершено</div>
            <div className="text-xl font-mono-num font-bold text-white mt-1">
              {formatTC(user.totalUpgrades)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.06] bg-[#14161A] p-5 xl:grid-cols-[minmax(260px,0.85fr)_1.15fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#FACC15]" />
            <h2 className="text-sm font-display font-bold text-white">Друзья ({friends.length})</h2>
          </div>
          <div className="space-y-2 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-3">
            <div className="text-[11px] text-slate-400">Ваш код приглашения</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-lg bg-white/[0.04] px-3 py-2 font-mono-num text-sm font-bold tracking-wider text-amber-200">
                {user.friendCode}
              </code>
              <button type="button" onClick={copyInviteLink} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300">
                <Copy className="h-3.5 w-3.5" /> Ссылка
              </button>
            </div>
            <label className="block text-[11px] text-slate-500" htmlFor="friend-invite-link">Ссылка-приглашение</label>
            <input id="friend-invite-link" readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] text-slate-300" />
          </div>
          <form onSubmit={handleAddFriend} className="flex gap-2">
            <input
              value={friendCodeInput}
              onChange={(event) => setFriendCodeInput(event.target.value.toUpperCase())}
              placeholder="Введите код друга"
              aria-label="Код друга"
              maxLength={40}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0D0F12] px-3 py-2 text-xs text-white outline-none focus:border-amber-300/50"
            />
            <button disabled={friendLoading || !friendCodeInput.trim()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
              <UserPlus className="h-3.5 w-3.5" /> Добавить
            </button>
          </form>
          {(friendMessage || friendInviteNotice) && <p role="status" className="text-[11px] text-amber-200">{friendMessage || friendInviteNotice}</p>}
          {friendRequestsReceived.length > 0 && <div className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
            <div className="text-[11px] font-bold text-amber-200">Входящие запросы ({friendRequestsReceived.length})</div>
            {friendRequestsReceived.map((request) => <div key={request.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-white">{request.fromTelegramUsername ? `@${request.fromTelegramUsername}` : request.fromUsername}</span>
              <button type="button" disabled={friendLoading} onClick={() => void handleFriendRequestChoice(request.id, true)} className="rounded-lg bg-emerald-500/15 px-2 py-1 font-semibold text-emerald-300 disabled:opacity-40">Принять</button>
              <button type="button" disabled={friendLoading} onClick={() => void handleFriendRequestChoice(request.id, false)} className="rounded-lg bg-rose-500/10 px-2 py-1 font-semibold text-rose-300 disabled:opacity-40">Отклонить</button>
            </div>)}
          </div>}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="text-[11px] text-slate-400">Ваш список друзей</div>
          {friends.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-xs text-slate-500">
              Здесь появятся друзья после добавления по коду или ссылке.
            </div>
          ) : (
            <ul className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {friends.map((friend) => {
                const friendTopDrop = friend.topDropItemId ? itemsMap.get(friend.topDropItemId) : undefined;
                return (
                  <li key={friend.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-2.5">
                    {friend.telegramPhotoUrl ? (
                      <img src={friend.telegramPhotoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-950" style={{ backgroundColor: friend.avatarColor }}>{friend.username.slice(0, 2).toUpperCase()}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-white">{friend.telegramUsername ? `@${friend.telegramUsername}` : friend.username}</div>
                      <div className="truncate text-[10px] text-slate-500">
                        {friendTopDrop ? `Топ-дроп: ${friendTopDrop.name} · ${formatTC(friend.topDropPrice)} TC` : `${formatTC(friend.totalUpgrades)} апгрейдов`}
                      </div>
                    </div>
                    <button type="button" disabled={friendLoading} onClick={() => void openFriendProfile(friend.id)} title="Профиль друга" aria-label={`Открыть профиль ${friend.username}`} className="rounded-md p-1.5 text-slate-400 hover:bg-amber-300/10 hover:text-amber-200 disabled:opacity-40"><ExternalLink className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void onRemoveFriend(friend.id).then(() => setFriendMessage('Друг удалён из списка.')).catch((error: unknown) => setFriendMessage(error instanceof Error ? error.message : 'Не удалось удалить друга.'))} title="Удалить из друзей" aria-label={`Удалить ${friend.username} из друзей`} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"><UserMinus className="h-3.5 w-3.5" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Main Content Split: Inventory + Telegram Bot Integration / New Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[#FACC15] text-[#0B0D10] flex items-center justify-center font-bold text-xs">
                {inventoryEntries.length}
              </div>
              <div className="w-7 h-7 rounded-md bg-[#1D2028] text-slate-400 flex items-center justify-center">
                <LayoutGrid className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm font-display font-bold text-white">Мой инвентарь</h2>
            </div>

            <div className="flex items-center gap-2">
              {inventoryEntries.length > 0 && (
                <button
                  type="button"
                  onClick={handleSellAll}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Продать всё ({formatTC(inventoryTotalValue)} TC)
                </button>
              )}
              <button
                type="button"
                onClick={onGoToUpgrade}
                className="px-3.5 py-1.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-display font-bold transition-colors cursor-pointer"
              >
                В апгрейд
              </button>
            </div>
          </div>

          {inventoryEntries.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-white/10 rounded-xl">
              <p className="text-sm text-slate-400">У вас пока нет карточек в инвентаре.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {inventoryEntries.map(({ inv, item }) => (
                <ProfileInventoryTile
                  key={inv.instanceId}
                  item={item}
                  onSell={async () => {
                    await onSellItems([inv.instanceId]);
                    soundFX.playCoin();
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right Column: verified Telegram account status */}
        <section className="lg:col-span-4 space-y-5">
          <div className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#2AABEE]" />
              <h2 className="text-sm font-display font-bold text-white">Авторизация аккаунта</h2>
            </div>
            <div className="bg-[#0D0F12] border border-white/[0.06] rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Статус:</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Подтверждён Telegram
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Telegram ID:</span>
                <span className="font-mono-num text-white">{user.telegramId || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Метод входа:</span>
                <span className="font-mono-num text-[#2AABEE]">{user.authProvider || 'telegram'}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Сайт получает Telegram ID из проверенных Telegram данных. Никнейм и имя в форме не используются для входа.
            </p>
          </div>
        </section>
      </div>

      {/* Financial Ledger & Upgrade History */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#FACC15]" fill="currentColor" aria-hidden="true">
              <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
              <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
            </svg>
            <h2 className="text-sm font-display font-bold text-white">История операций и апгрейдов</h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0D0F12] border border-white/[0.06] rounded-lg">
            <button
              type="button"
              onClick={() => setHistoryTab('ledger')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                historyTab === 'ledger' ? 'bg-[#FACC15]/15 text-[#FACC15]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Транзакции ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab('upgrades')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                historyTab === 'upgrades' ? 'bg-[#FACC15]/15 text-[#FACC15]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Апгрейды ({upgradeHistory.length})
            </button>
          </div>
        </div>

        {historyTab === 'ledger' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Операция</th>
                  <th className="py-2.5 pr-4 font-medium">Детали</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Сумма</th>
                  <th className="py-2.5 font-medium text-right">Баланс после</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 text-xs">
                      Транзакций пока нет.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">
                        {TX_LABELS[tx.type]}
                      </td>
                      <td className="py-3 pr-4 text-slate-400 text-xs">
                        {tx.description}
                        {tx.meta ? ` · ${tx.meta}` : ''}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                          tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${formatTC(tx.amount)}` : formatTC(tx.amount)} TC
                      </td>
                      <td className="py-3 text-right font-mono-num text-slate-300 whitespace-nowrap">
                        {formatTC(tx.balanceAfter)} TC
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Цель</th>
                  <th className="py-2.5 pr-4 font-medium">Ставка</th>
                  <th className="py-2.5 pr-4 font-medium">Шанс / Ролл</th>
                  <th className="py-2.5 font-medium text-right">Итог</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {upgradeHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 text-xs">
                      Апгрейдов пока не было.
                    </td>
                  </tr>
                ) : (
                  upgradeHistory.map((h) => {
                    const target = itemsMap.get(h.targetItemId);
                    return (
                      <tr key={h.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 pr-4 text-white font-medium">
                          {target ? `${target.name} (${RARITY_LABELS[target.rarity]})` : h.targetItemId}
                        </td>
                        <td className="py-3 pr-4 font-mono-num text-slate-300">
                          {formatTC(h.stakeTotal)} TC → {formatTC(h.targetPrice)} TC
                        </td>
                        <td className="py-3 pr-4 font-mono-num text-xs text-slate-400">
                          {h.winChance.toFixed(2)}% ({h.rollMode === 'under' ? '<' : '>'}) · Ролл{' '}
                          {h.rollValue.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 text-right font-semibold ${
                            h.won ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {h.won ? `Победа (${h.multiplier}x)` : 'Неудача'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="friend-profile-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#14161A] p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {selectedFriend.telegramPhotoUrl ? (
                  <img src={selectedFriend.telegramPhotoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full font-bold text-slate-950" style={{ backgroundColor: selectedFriend.avatarColor }}>{selectedFriend.username.slice(0, 2).toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <h2 id="friend-profile-title" className="truncate text-lg font-bold text-white">{selectedFriend.username}</h2>
                  {selectedFriend.telegramUsername && <p className="truncate text-xs text-sky-300">@{selectedFriend.telegramUsername}</p>}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedFriend(null)} aria-label="Закрыть профиль друга" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] text-slate-500">Апгрейдов</div><div className="mt-1 font-mono-num font-bold text-white">{formatTC(selectedFriend.totalUpgrades)}</div></div>
              <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] text-slate-500">Побед</div><div className="mt-1 font-mono-num font-bold text-emerald-300">{formatTC(selectedFriend.wonUpgrades)}</div></div>
              <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] text-slate-500">Кейсов открыто</div><div className="mt-1 font-mono-num font-bold text-white">{formatTC(selectedFriend.totalCasesOpened)}</div></div>
              <div className="rounded-lg bg-black/20 p-3"><div className="text-[10px] text-slate-500">В инвентаре</div><div className="mt-1 font-mono-num font-bold text-white">{selectedFriend.inventory.length}</div></div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-200"><Crown className="h-4 w-4" />Топ-дроп</div>
              {selectedFriend.topDrop ? (
                <div className="flex items-center gap-3">
                  <img src={selectedFriend.topDrop.imageUrl} alt="" className="h-14 w-16 object-contain" />
                  <div><div className="font-semibold text-white">{selectedFriend.topDrop.name}</div><div className="text-sm font-mono-num text-amber-200">{formatTC(selectedFriend.topDropPrice)} TC · {RARITY_LABELS[selectedFriend.topDrop.rarity]}</div></div>
                </div>
              ) : <p className="text-xs text-slate-500">Пока нет выпавших карточек.</p>}
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Инвентарь друга</h3>
              {selectedFriend.inventory.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-slate-500">Инвентарь пуст.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedFriend.inventory.map((entry, index) => (
                    <article key={`${entry.item.id}-${entry.acquiredAt}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-2">
                      <img src={entry.item.imageUrl} alt="" className="h-10 w-12 shrink-0 object-contain" />
                      <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-white">{entry.item.name}</div><div className="text-[10px] text-slate-400">{formatTC(entry.item.price)} TC</div></div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

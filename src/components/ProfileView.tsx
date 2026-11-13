import React, { useMemo, useState } from 'react';
import { Bot, Coins, LayoutGrid, PlusCircle, ShieldCheck, UserCheck, Wallet } from 'lucide-react';
import type {
  BootstrapPayload,
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
  users: BootstrapPayload['users'];
  items: ItemCard[];
  transactions: BootstrapPayload['transactions'];
  upgradeHistory: BootstrapPayload['upgradeHistory'];
  onOpenTelegramLogin: () => void;
  onSwitchUser: (userId: string) => void;
  onRegisterUser: (username: string, referralCode?: string) => Promise<void>;
  onSellItems: (instanceIds: string[]) => Promise<void>;
  onOpenDeposit: () => void;
  onGoToUpgrade: () => void;
}

const TX_LABELS: Record<TransactionType, string> = {
  deposit: 'Пополнение',
  case_open: 'Открытие кейса',
  item_sell: 'Продажа карточки',
  upgrade_stake: 'Ставка в апгрейд',
  upgrade_win: 'Выигрыш апгрейда',
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
  users,
  items,
  transactions,
  upgradeHistory,
  onOpenTelegramLogin,
  onSwitchUser,
  onRegisterUser,
  onSellItems,
  onOpenDeposit,
  onGoToUpgrade,
}) => {
  const [newUsername, setNewUsername] = useState('');
  const [newRefCode, setNewRefCode] = useState('');
  const [regError, setRegError] = useState('');
  const [historyTab, setHistoryTab] = useState<'ledger' | 'upgrades'>('ledger');

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

  const winRate =
    user.totalUpgrades > 0
      ? ((user.wonUpgrades / user.totalUpgrades) * 100).toFixed(1)
      : '0.0';

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    try {
      await onRegisterUser(newUsername, newRefCode);
      setNewUsername('');
      setNewRefCode('');
      soundFX.playCoin();
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Ошибка создания аккаунта.');
    }
  };

  const handleSellAll = async () => {
    if (inventoryEntries.length === 0) return;
    await onSellItems(inventoryEntries.map((e) => e.inv.instanceId));
    soundFX.playCoin();
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

      {/* Top Profile Header + 4-Column KPI Row */}
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
            <label htmlFor="account-switcher" className="text-xs text-slate-400">
              Аккаунт:
            </label>
            <select
              id="account-switcher"
              value={user.id}
              onChange={(e) => onSwitchUser(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#FACC15] cursor-pointer"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.telegramUsername ? `@${u.telegramUsername}` : u.username} ({formatTC(u.balance)} TC)
                </option>
              ))}
            </select>

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

        {/* 4-Column KPI Row styled with top 2px accent bars */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/[0.06]">
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

        {/* Right Column: Telegram Bot Sync Status & Create Account */}
        <section className="lg:col-span-4 space-y-5">
          <div className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#2AABEE]" />
              <h2 className="text-sm font-display font-bold text-white">Связь с Telegram-ботом</h2>
            </div>
            <div className="bg-[#0D0F12] border border-white/[0.06] rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Статус:</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Привязан
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
              Единый Telegram ID синхронизирует ваш баланс и инвентарь между сайтом, Mini App и командами бота (`/balance`, `/inventory`).
            </p>
          </div>

          <div className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-3.5">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#FACC15]" />
              <h2 className="text-sm font-display font-bold text-white">Новый профиль</h2>
            </div>
            <p className="text-[11px] text-slate-400">
              Код <span className="font-mono-num text-slate-200">{user.referralCode}</span> даёт другу +300 TC, а вам +150 TC.
            </p>

            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label htmlFor="new-username" className="block text-[11px] text-slate-300 mb-1">
                  Никнейм
                </label>
                <input
                  id="new-username"
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Например, VanyaPro"
                  className="w-full px-3 py-2 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label htmlFor="new-ref-code" className="block text-[11px] text-slate-300 mb-1">
                  Реферальный код
                </label>
                <input
                  id="new-ref-code"
                  type="text"
                  value={newRefCode}
                  onChange={(e) => setNewRefCode(e.target.value)}
                  placeholder={user.referralCode}
                  className="w-full px-3 py-2 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs text-white uppercase font-mono-num focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              {regError && <p className="text-xs text-rose-400">{regError}</p>}

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-[#0D0F12] hover:bg-white/[0.08] border border-white/[0.08] text-white font-display font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>Создать и войти</span>
              </button>
            </form>
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
    </div>
  );
};

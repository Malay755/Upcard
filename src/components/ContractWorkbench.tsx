import React, { useMemo, useState } from 'react';
import { ArrowRight, Flame, RefreshCw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { InventoryItem, ItemCard, Rarity, UserProfile } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import {
  CONTRACT_REQUIRED_COUNT,
  buildContractPreview,
  calculateContractOutcomes,
  getNextContractRarity,
} from '../utils/contracts';
import { formatTC, RARITY_LABELS } from '../utils/economics';
import { soundFX } from '../utils/sound';
import { CardFrame } from './CardFrame';
import { GoatLogo } from './GoatLogo';
import { LegendaryRevealModal } from './LegendaryRevealModal';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';

export interface ContractCraftResult {
  wonItem: ItemCard;
  instance: InventoryItem;
  xpGained: number;
  inputRarity: Rarity;
  targetRarity: Rarity;
}

interface ContractWorkbenchProps {
  user: UserProfile;
  items: ItemCard[];
  isAuthorized: boolean;
  onOpenTelegramLogin: () => void;
  onCraftContract: (instanceIds: string[]) => Promise<ContractCraftResult>;
  onGoToCases: () => void;
}

const RARITY_ACCENT: Record<
  Rarity,
  { border: string; text: string; bg: string; bar: string }
> = {
  common: {
    border: 'border-slate-400/30',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    bar: 'bg-slate-400',
  },
  rare: {
    border: 'border-emerald-400/35',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    bar: 'bg-emerald-400',
  },
  super_rare: {
    border: 'border-sky-400/35',
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    bar: 'bg-sky-400',
  },
  epic: {
    border: 'border-purple-400/35',
    text: 'text-purple-300',
    bg: 'bg-purple-500/10',
    bar: 'bg-purple-400',
  },
  legendary: {
    border: 'border-[#FACC15]/40',
    text: 'text-[#FACC15]',
    bg: 'bg-[#FACC15]/10',
    bar: 'bg-[#FACC15]',
  },
};

const CONTRACT_FILTER_TABS: { id: 'all' | 'rare' | 'super_rare' | 'epic'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'rare', label: 'Редкая' },
  { id: 'super_rare', label: 'Сверхредкая' },
  { id: 'epic', label: 'Эпическая' },
];

const SlotMiniCard: React.FC<{ item: ItemCard; index: number; onRemove: () => void; disabled?: boolean }> = ({
  item,
  index,
  onRemove,
  disabled,
}) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  const accent = RARITY_ACCENT[item.rarity];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRemove}
      title={`Убрать «${item.name}» из слота #${index + 1}`}
      className={`group relative rounded-xl border ${accent.border} bg-gradient-to-b from-white/[0.04] to-[#0D0F12] p-2 flex flex-col items-center justify-between h-[118px] transition-all hover:border-rose-400/50 cursor-pointer disabled:cursor-not-allowed`}
    >
      <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${accent.bar}`} />
      <div className="w-full flex items-center justify-between text-[9px] font-mono-num">
        <span className="text-slate-500">#{index + 1}</span>
        <span className="text-slate-400 group-hover:text-rose-400 transition-colors">
          <X className="w-3 h-3" />
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0 my-0.5">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-14 w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.8)]"
          />
        )}
      </div>
      <div className="w-full text-center">
        <div className="text-[10px] font-bold text-white truncate">{item.name}</div>
        <div className="text-[9px] font-mono-num text-[#FACC15]">{formatTC(item.price)} TC</div>
      </div>
    </button>
  );
};

export const ContractWorkbench: React.FC<ContractWorkbenchProps> = ({
  user,
  items,
  isAuthorized,
  onOpenTelegramLogin,
  onCraftContract,
  onGoToCases,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rarityFilter, setRarityFilter] = useState<'all' | 'rare' | 'super_rare' | 'epic'>('all');
  const [isCrafting, setIsCrafting] = useState(false);
  const [lastCraft, setLastCraft] = useState<ContractCraftResult | null>(null);
  const [legendaryReveal, setLegendaryReveal] = useState<ItemCard | null>(null);
  const [error, setError] = useState('');

  const itemsMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const ownedEntries = useMemo(() => {
    return user.inventory
      .map((inv) => ({ inv, item: itemsMap.get(inv.itemId) }))
      .filter((entry): entry is { inv: InventoryItem; item: ItemCard } => Boolean(entry.item))
      .sort((a, b) => a.item.price - b.item.price);
  }, [user.inventory, itemsMap]);

  const selectedEntries = useMemo(() => {
    const byId = new Map(ownedEntries.map((entry) => [entry.inv.instanceId, entry]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is { inv: InventoryItem; item: ItemCard } => Boolean(entry));
  }, [ownedEntries, selectedIds]);

  const selectedItems = useMemo(() => selectedEntries.map((entry) => entry.item), [selectedEntries]);

  const preview = useMemo(() => buildContractPreview(selectedItems, items), [selectedItems, items]);

  const activeInputRarity: Rarity | null = selectedEntries[0]?.item.rarity ?? null;

  const totalInputValue = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.price, 0),
    [selectedItems]
  );

  // Determine which rarities have >= 7 eligible cards for quick fill
  const quickFillRarity: Rarity | null = useMemo(() => {
    if (activeInputRarity && getNextContractRarity(activeInputRarity)) {
      const count = ownedEntries.filter((e) => e.item.rarity === activeInputRarity).length;
      if (count >= 1) return activeInputRarity;
    }
    const order: Rarity[] = ['rare', 'super_rare', 'epic', 'common'];
    for (const r of order) {
      const count = ownedEntries.filter((e) => e.item.rarity === r).length;
      if (count >= CONTRACT_REQUIRED_COUNT && calculateContractOutcomes(getNextContractRarity(r)!, items).length > 0) {
        return r;
      }
    }
    // Fallback to any non-legendary rarity if user wants partial auto-fill
    if (rarityFilter !== 'all') {
      const count = ownedEntries.filter((e) => e.item.rarity === rarityFilter).length;
      if (count > 0) return rarityFilter;
    }
    return null;
  }, [activeInputRarity, ownedEntries, items, rarityFilter]);

  const filteredInventory = useMemo(() => {
    return ownedEntries.filter((entry) =>
      rarityFilter === 'all' ? true : entry.item.rarity === rarityFilter
    );
  }, [ownedEntries, rarityFilter]);

  const handleToggleCard = (instanceId: string, card: ItemCard) => {
    if (isCrafting || !isAuthorized) return;
    setError('');

    if (selectedIds.includes(instanceId)) {
      setSelectedIds((prev) => prev.filter((id) => id !== instanceId));
      return;
    }

    if (!getNextContractRarity(card.rarity)) {
      setError('Легендарные карты уже максимальной редкости и не участвуют в контрактах.');
      return;
    }

    if (activeInputRarity && card.rarity !== activeInputRarity) {
      setError(`В активном контракте выбрана редкость «${RARITY_LABELS[activeInputRarity]}». Очистите слоты или выберите карту той же редкости.`);
      return;
    }

    if (selectedIds.length >= CONTRACT_REQUIRED_COUNT) {
      setError(`В контракте ровно ${CONTRACT_REQUIRED_COUNT} слотов. Уберите одну карту, чтобы заменить.`);
      return;
    }

    setSelectedIds((prev) => [...prev, instanceId]);
  };

  const handleAutoPickSeven = () => {
    if (isCrafting || !isAuthorized) return;
    setError('');
    const target = quickFillRarity;
    if (!target) {
      setError('В инвентаре нет подходящих карт для контракта.');
      return;
    }
    const candidates = ownedEntries
      .filter((entry) => entry.item.rarity === target)
      .slice(0, CONTRACT_REQUIRED_COUNT)
      .map((entry) => entry.inv.instanceId);
    setSelectedIds(candidates);
    if (candidates.length < CONTRACT_REQUIRED_COUNT) {
      setError(`Выбрано ${candidates.length} из ${CONTRACT_REQUIRED_COUNT} карт редкости «${RARITY_LABELS[target]}».`);
    }
  };

  const handleCraft = async () => {
    if (isCrafting) return;
    setError('');

    if (!isAuthorized) {
      onOpenTelegramLogin();
      return;
    }

    if (!preview.eligible) {
      setError(preview.reason || `Выберите ${CONTRACT_REQUIRED_COUNT} карт одной редкости.`);
      return;
    }

    setIsCrafting(true);
    setLastCraft(null);

    try {
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const [result] = await Promise.all([
        onCraftContract(selectedIds),
        new Promise((resolve) => setTimeout(resolve, reducedMotion ? 120 : 620)),
      ]);
      setSelectedIds([]);
      setLastCraft(result);

      if (result.wonItem.rarity === 'legendary') {
        soundFX.playItemDropSound('legendary');
        soundFX.playLegendaryRevealSound();
        setLegendaryReveal(result.wonItem);
      } else {
        soundFX.playWin(result.wonItem.rarity);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подписать контракт.');
    } finally {
      setIsCrafting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="contract-workbench">
      <div className="flex items-center justify-center gap-2 pt-1">
        <GoatLogo className="h-8 w-8 text-[#FACC15]" />
        <h1 className="text-xl font-display font-black tracking-wider uppercase text-white">
          КОНТРАКТЫ
        </h1>
      </div>

      {/* Top Stage: 7-Slot Contract Table */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#FACC15]" />
                <span>Контракт обмена 7 → 1</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Соберите 7 карт одной редкости и получите 1 карту следующей редкости
              </p>
            </div>

            {isAuthorized && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isCrafting || !quickFillRarity}
                  onClick={handleAutoPickSeven}
                  data-testid="contract-autopick"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FACC15]/15 hover:bg-[#FACC15]/25 border border-[#FACC15]/30 text-[11px] font-semibold text-[#FACC15] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>
                    {quickFillRarity
                      ? `Выбрать 7 (${RARITY_LABELS[quickFillRarity]})`
                      : 'Автоподбор 7'}
                  </span>
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    disabled={isCrafting}
                    onClick={() => {
                      setSelectedIds([]);
                      setError('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0D0F12] hover:bg-white/[0.06] border border-white/[0.08] text-[11px] text-slate-300 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Очистить</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 7 Slots Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Array.from({ length: CONTRACT_REQUIRED_COUNT }, (_, idx) => {
              const entry = selectedEntries[idx];
              if (entry) {
                return (
                  <SlotMiniCard
                    key={entry.inv.instanceId}
                    item={entry.item}
                    index={idx}
                    disabled={isCrafting}
                    onRemove={() => handleToggleCard(entry.inv.instanceId, entry.item)}
                  />
                );
              }
              return (
                <div
                  key={`empty-${idx}`}
                  data-testid={`contract-slot-${idx}`}
                  className="rounded-xl border border-dashed border-white/[0.1] bg-[#0D0F12]/70 h-[118px] flex flex-col items-center justify-center text-center p-1.5"
                >
                  <span className="text-xs font-mono-num font-bold text-slate-600">#{idx + 1}</span>
                  <span className="text-[9px] text-slate-600 mt-1">Пусто</span>
                </div>
              );
            })}
          </div>

          {/* Status Summary + Result Banner */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0D0F12] border border-white/[0.06] px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Редкость:</span>
                {activeInputRarity ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={RARITY_ACCENT[activeInputRarity].text}>
                      {RARITY_LABELS[activeInputRarity]}
                    </span>
                    {preview.targetRarity && (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className={RARITY_ACCENT[preview.targetRarity].text}>
                          {RARITY_LABELS[preview.targetRarity]}
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-500">Редкая → Сверхредкая → Эпическая → Легендарная</span>
                )}
              </div>
              <div className="font-mono-num">
                <span className="text-slate-400">Сумма входа: </span>
                <span className="text-[#FACC15] font-bold">{formatTC(totalInputValue)} TC</span>
              </div>
            </div>

            {lastCraft && (
              <div
                data-testid="contract-result-banner"
                className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3 flex flex-wrap items-center justify-between gap-3 animate-banner-in"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CardFrame item={lastCraft.wonItem} size="xs" showPrice={false} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-emerald-300">
                      Контракт выполнен!
                    </div>
                    <div className="text-sm font-display font-bold text-white truncate">
                      {lastCraft.wonItem.name}
                    </div>
                    <div className="text-xs font-mono-num text-[#FACC15]">
                      {formatTC(lastCraft.wonItem.price)} TC · {RARITY_LABELS[lastCraft.wonItem.rarity]}
                    </div>
                  </div>
                </div>
                {lastCraft.xpGained > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FACC15]/15 border border-[#FACC15]/35 text-xs font-mono-num font-bold text-[#FACC15]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+{lastCraft.xpGained} XP · Новая в дневнике!</span>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="button"
              data-testid="contract-submit"
              disabled={isCrafting || (isAuthorized && !preview.eligible)}
              onClick={handleCraft}
              className="w-full py-3 px-6 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] disabled:opacity-45 text-[#0B0D10] font-display font-bold text-sm transition-all duration-150 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(250,204,21,0.2)]"
            >
              {isCrafting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Подписываем контракт...</span>
                </>
              ) : !isAuthorized ? (
                <>
                  <span>Войти через Telegram для контракта</span>
                  <TelegramPaperPlaneIcon className="w-4 h-4" />
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4" />
                  <span>
                    Подписать контракт ({selectedIds.length}/{CONTRACT_REQUIRED_COUNT})
                  </span>
                </>
              )}
            </button>
          </div>
      </section>

      {/* Bottom Inventory Selector */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-display font-bold text-white">
              Ваш инвентарь для контракта ({ownedEntries.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Фильтр редкости инвентаря">
            {CONTRACT_FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRarityFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  rarityFilter === tab.id
                    ? 'bg-[#FACC15] text-[#0B0D10]'
                    : 'bg-[#0D0F12] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!isAuthorized ? (
          <div className="py-10 text-center border border-dashed border-white/10 rounded-xl space-y-3">
            <p className="text-xs text-slate-400">
              Войдите через Telegram, чтобы выбирать карточки инвентаря для контрактов 7-в-1.
            </p>
            <button
              type="button"
              onClick={onOpenTelegramLogin}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-display font-bold cursor-pointer"
            >
              <span>Login via Telegram</span>
              <TelegramPaperPlaneIcon className="w-4 h-4" />
            </button>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-white/10 rounded-xl space-y-3">
            <p className="text-sm text-slate-400">
              {ownedEntries.length === 0
                ? 'У вас пока нет карточек для контракта.'
                : 'В выбранной редкости нет карточек.'}
            </p>
            {ownedEntries.length === 0 && (
              <button
                type="button"
                onClick={onGoToCases}
                className="px-4 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-bold cursor-pointer"
              >
                Открыть кейсы
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredInventory.map(({ inv, item }) => {
              const isSelected = selectedIds.includes(inv.instanceId);
              const isLegendary = !getNextContractRarity(item.rarity);
              const wrongRarity = Boolean(activeInputRarity && item.rarity !== activeInputRarity);
              const disabled = !isSelected && (isLegendary || wrongRarity);

              return (
                <div
                  key={inv.instanceId}
                  className={`flex flex-col items-center transition-opacity ${
                    disabled ? 'opacity-35' : 'opacity-100'
                  }`}
                >
                  <CardFrame
                    item={item}
                    size="sm"
                    selected={isSelected}
                    onClick={() => handleToggleCard(inv.instanceId, item)}
                  />
                  {isLegendary && (
                    <span className="mt-1 text-[10px] text-amber-300/80">Макс. редкость</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <LegendaryRevealModal
        item={legendaryReveal}
        sourceLabel="Контракт 7-в-1 выполнен!"
        onClose={() => setLegendaryReveal(null)}
      />
    </div>
  );
};

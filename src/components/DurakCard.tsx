import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { DurakCard as DurakCardType, DurakSuit, ItemCard } from '../types';
import {
  DURAK_RANK_ORDER,
  DURAK_SUIT_META,
  DURAK_SUIT_ORDER,
  buildDurak32Deck,
  getDurakRankLabel,
} from '../utils/durakDeck';

interface DurakCardProps {
  card: DurakCardType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  rotated?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_CLASSES: Record<NonNullable<DurakCardProps['size']>, string> = {
  xs: 'w-[58px] h-[78px] rounded-lg',
  sm: 'w-[74px] h-[99px] rounded-lg',
  md: 'w-[86px] h-[115px] sm:w-[98px] sm:h-[131px] rounded-xl',
  lg: 'w-[104px] h-[139px] sm:w-[116px] sm:h-[155px] rounded-xl',
};

export const DurakCard: React.FC<DurakCardProps> = ({
  card,
  size = 'md',
  selected = false,
  playable = false,
  disabled = false,
  rotated = false,
  onClick,
  ariaLabel,
  className = '',
  style,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const rankLabel = getDurakRankLabel(card.rank);
  const suitMeta = DURAK_SUIT_META[card.suit];
  const colorClass = suitMeta.isRed ? 'text-[#DC2626]' : 'text-[#111827]';
  const label = ariaLabel ?? `${rankLabel} ${suitMeta.symbol} — ${card.name}`;

  const interactiveClasses = onClick
    ? disabled
      ? 'opacity-80 brightness-95 cursor-not-allowed'
      : selected
      ? 'cursor-pointer -translate-y-3 ring-2 ring-[#FACC15] shadow-[0_14px_30px_rgba(250,204,21,0.38)] z-20'
      : playable
      ? 'cursor-pointer -translate-y-1 hover:-translate-y-2.5 ring-2 ring-[#FACC15]/80 hover:ring-[#FACC15] shadow-[0_8px_20px_rgba(0,0,0,0.5)]'
      : 'cursor-pointer hover:-translate-y-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.45)]'
    : 'shadow-[0_6px_16px_rgba(0,0,0,0.45)]';

  const cardInner = (
    <div
      style={style}
      className={`relative select-none overflow-hidden bg-white border border-slate-200/95 ring-1 ring-inset ring-black/[0.04] transition-transform duration-150 ${SIZE_CLASSES[size]} ${
        rotated ? 'rotate-90' : ''
      } ${interactiveClasses} ${className}`}
    >
      {!imgFailed ? (
        <img
          src={card.imageUrl}
          alt={label}
          draggable={false}
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover object-center scale-[1.01] bg-white"
        />
      ) : (
        <div className={`flex h-full w-full flex-col justify-between bg-white p-1.5 ${colorClass}`}>
          <div className="flex flex-col items-start leading-none">
            <span className="font-display text-sm font-black">{rankLabel}</span>
            <span className="text-xs leading-none">{suitMeta.symbol}</span>
          </div>
          <div className="px-1 text-center text-[9px] font-bold leading-tight text-slate-700 line-clamp-2">
            {card.name}
          </div>
          <div className="flex flex-col items-start leading-none rotate-180">
            <span className="font-display text-sm font-black">{rankLabel}</span>
            <span className="text-xs leading-none">{suitMeta.symbol}</span>
          </div>
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected}
        title={`${rankLabel}${suitMeta.symbol} · ${card.name}`}
        className="group relative bg-transparent p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] rounded-xl"
      >
        {cardInner}
      </button>
    );
  }

  return (
    <div title={`${rankLabel}${suitMeta.symbol} · ${card.name}`} className="relative">
      {cardInner}
    </div>
  );
};

export const DurakCardBack: React.FC<{
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  shimmer?: boolean;
}> = ({
  size = 'xs',
  className = '',
  shimmer = false,
}) => {
  const sizeMap = {
    xs: 'w-[34px] h-[48px] rounded-md',
    sm: 'w-[58px] h-[78px] rounded-lg',
    md: 'w-[74px] h-[99px] rounded-lg',
  }[size];

  return (
    <div
      aria-hidden="true"
      className={`${sizeMap} ${className} relative overflow-hidden border border-amber-300/45 bg-gradient-to-br from-[#164E3B] via-[#0B2D22] to-[#081F17] shadow-md`}
    >
      <div
        className="absolute inset-1 rounded border border-amber-300/35"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(250,204,21,0.1) 0px, rgba(250,204,21,0.1) 4px, transparent 4px, transparent 8px)',
        }}
      />
      <div className="absolute inset-2 rounded-[3px] border border-amber-200/15 pointer-events-none" />
      {shimmer && (
        <div
          className="durak-deck-sheen pointer-events-none absolute -inset-y-4 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-amber-200/35 to-transparent"
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/35 bg-[#081F17]/80 text-[10px] font-display font-black text-amber-300/80 shadow-inner">
          Ф
        </span>
      </div>
    </div>
  );
};

export const DurakAnimatedDeckPreview: React.FC<{
  onClick?: () => void;
  compact?: boolean;
}> = ({ onClick, compact = false }) => {
  const Wrapper = onClick ? 'button' : 'div';
  const dim = compact ? 'w-12 h-14' : 'w-16 h-16';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? 'Открыть анимированную колоду 32 карт' : undefined}
      className={`group relative ${dim} shrink-0 flex items-center justify-center select-none ${
        onClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] rounded-xl' : ''
      }`}
    >
      <div className="durak-fan-left absolute transition-transform duration-300 group-hover:-translate-x-4 group-hover:-rotate-[18deg]">
        <div className="flex h-12 w-9 flex-col justify-between rounded-md border border-slate-200 bg-white p-1 text-[#111827] shadow-md">
          <span className="font-display text-[9px] font-black leading-none">7♠</span>
          <span className="self-end font-display text-[9px] font-black leading-none rotate-180">7♠</span>
        </div>
      </div>
      <div className="durak-fan-right absolute transition-transform duration-300 group-hover:translate-x-4 group-hover:rotate-[18deg]">
        <div className="flex h-12 w-9 flex-col justify-between rounded-md border border-slate-200 bg-white p-1 text-[#DC2626] shadow-md">
          <span className="font-display text-[9px] font-black leading-none">Т♥</span>
          <span className="self-end font-display text-[9px] font-black leading-none rotate-180">Т♥</span>
        </div>
      </div>
      <div className="durak-fan-center relative z-10 transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:scale-105">
        <DurakCardBack size="xs" shimmer className="h-12 w-9 rounded-md shadow-lg" />
        <span className="absolute -bottom-1 -right-1 rounded bg-[#FACC15] px-1 py-[1px] font-mono-num text-[9px] font-black leading-none text-[#0B0D10] shadow">
          32
        </span>
      </div>
    </Wrapper>
  );
};

export const DurakSuitBadge: React.FC<{ suit: DurakSuit; labelPrefix?: string }> = ({
  suit,
  labelPrefix = 'Козырь',
}) => {
  const meta = DURAK_SUIT_META[suit];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0D0F12]/90 px-2.5 py-1 text-xs font-bold text-white">
      <span className="text-slate-400">{labelPrefix}:</span>
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded bg-white text-sm font-black leading-none ${
          meta.isRed ? 'text-[#DC2626]' : 'text-[#111827]'
        }`}
      >
        {meta.symbol}
      </span>
      <span>{meta.nameRu}</span>
    </span>
  );
};

interface DurakDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ItemCard[];
}

export const DurakDeckModal: React.FC<DurakDeckModalProps> = ({ isOpen, onClose, items }) => {
  if (!isOpen) return null;
  const deck = buildDurak32Deck(items);
  const rankDesc = [...DURAK_RANK_ORDER].reverse();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Колода 32 карт для Дурака"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#14161A] shadow-2xl animate-modal-panel">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <DurakAnimatedDeckPreview compact />
            <div>
              <h2 className="font-display text-lg font-extrabold text-white">Колода Дурака — 32 карты</h2>
              <p className="text-xs text-slate-400">
                От 7 до Туза по 4 мастям. Вне колоды: Толстый Кирилл и Перекус Тимура.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть колоду"
            className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 hover:bg-white/[0.1] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
          {DURAK_SUIT_ORDER.map((suit, suitIdx) => {
            const suitMeta = DURAK_SUIT_META[suit];
            const suitCards = rankDesc
              .map((r) => deck.find((c) => c.suit === suit && c.rank === r))
              .filter((c): c is DurakCardType => Boolean(c));
            return (
              <div key={suit} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-base font-black ${
                      suitMeta.isRed ? 'text-[#DC2626]' : 'text-[#111827]'
                    }`}
                  >
                    {suitMeta.symbol}
                  </span>
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                    {suitMeta.nameRu} ({suitCards.length})
                  </h3>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                  {suitCards.map((card, cardIdx) => {
                    const dealDelayMs = (suitIdx * 8 + cardIdx) * 18;
                    return (
                      <div
                        key={card.id}
                        style={{ '--deal-delay': `${dealDelayMs}ms` } as React.CSSProperties}
                        className="durak-modal-card-in group flex flex-col items-center gap-1.5"
                      >
                        <div className="transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:scale-[1.04]">
                          <DurakCard card={card} size="sm" />
                        </div>
                        <div className="text-center">
                          <div className="text-[11px] font-bold text-white leading-tight line-clamp-1">
                            {card.name}
                          </div>
                          <div className="text-[10px] font-mono-num text-slate-400">
                            {getDurakRankLabel(card.rank)} {suitMeta.symbol}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

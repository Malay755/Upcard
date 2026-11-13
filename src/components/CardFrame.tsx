import React from 'react';
import type { ItemCard, Rarity } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import { formatTC, RARITY_LABELS } from '../utils/economics';

interface RarityAccent {
  accentHex: string;
  glow: string;
  ringColor: string;
}

export const RARITY_THEMES: Record<Rarity, RarityAccent> = {
  legendary: {
    accentHex: '#FACC15',
    glow: 'rgba(250, 204, 21, 0.42)',
    ringColor: '#FDE047',
  },
  epic: {
    accentHex: '#C084FC',
    glow: 'rgba(168, 85, 247, 0.42)',
    ringColor: '#D8B4FE',
  },
  rare: {
    accentHex: '#34D399',
    glow: 'rgba(34, 197, 94, 0.36)',
    ringColor: '#6EE7B7',
  },
  common: {
    accentHex: '#94A3B8',
    glow: 'rgba(148, 163, 184, 0.25)',
    ringColor: '#CBD5E1',
  },
};

interface CardFrameProps {
  item: Pick<ItemCard, 'name' | 'rarity' | 'price' | 'imageUrl'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  showPrice?: boolean;
  onClick?: () => void;
  className?: string;
}

export const CardFrame: React.FC<CardFrameProps> = ({
  item,
  size = 'md',
  selected = false,
  showPrice = true,
  onClick,
  className = '',
}) => {
  const accent = RARITY_THEMES[item.rarity] ?? RARITY_THEMES.common;
  const resolvedImg = resolveAssetUrl(item.imageUrl);
  const { displayUrl, ready } = useCleanCardImage(resolvedImg);

  const sizeClasses: Record<NonNullable<CardFrameProps['size']>, string> = {
    xs: 'w-24',
    sm: 'w-32',
    md: 'w-44',
    lg: 'w-64',
  };

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `${item.name} · ${RARITY_LABELS[item.rarity]} · ${formatTC(item.price)} TC` : undefined}
      className={`group relative flex flex-col items-center select-none transition-transform duration-200 ${
        onClick
          ? 'cursor-pointer hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] rounded-xl'
          : ''
      } ${sizeClasses[size]} ${className}`}
    >
      {/* Pre-rendered Finished Card Artwork (no SVG template overlay) */}
      <div
        className="relative w-full aspect-[3/4] flex items-center justify-center transition-transform duration-200"
        style={{
          filter: selected
            ? `drop-shadow(0 0 18px ${accent.glow}) drop-shadow(0 0 4px ${accent.ringColor})`
            : 'drop-shadow(0 10px 18px rgba(0,0,0,0.68))',
        }}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
            className={`w-full h-full object-contain transition-opacity duration-150 ${
              ready ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="w-full h-full rounded-xl border border-dashed border-white/15 bg-[#0D0F12] flex items-center justify-center text-slate-400 text-xs font-medium">
            Нет фото
          </div>
        )}

        {/* Selected Ring Overlay */}
        {selected && (
          <div
            className="absolute inset-0 rounded-xl ring-2 ring-amber-400 pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Clean Unboxed Price Line Below Card */}
      {showPrice && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-mono-num font-semibold text-slate-200">
          <span style={{ color: accent.accentHex }}>{formatTC(item.price)}</span>
          <span className="text-slate-400 text-[11px]">TC</span>
        </div>
      )}
    </Wrapper>
  );
};

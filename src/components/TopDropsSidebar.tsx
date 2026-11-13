import React, { useMemo } from 'react';
import { Crown, Sparkles } from 'lucide-react';
import type { ItemCard, LiveDropEntry } from '../types';
import { formatTC, RARITY_LABELS } from '../utils/economics';
import { resolveAssetUrl } from '../utils/assets';

interface TopDropsSidebarProps {
  liveDrops: LiveDropEntry[];
  items: ItemCard[];
}

const rarityStyle: Record<ItemCard['rarity'], string> = {
  common: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
  rare: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  epic: 'border-purple-400/40 bg-purple-400/10 text-purple-300',
  legendary: 'border-amber-300/50 bg-amber-300/10 text-amber-200',
};

export const TopDropsSidebar: React.FC<TopDropsSidebarProps> = ({ liveDrops, items }) => {
  const topDrops = useMemo(() => {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    return liveDrops
      .map((drop) => ({ drop, item: itemsById.get(drop.itemId) }))
      .filter((entry): entry is { drop: LiveDropEntry; item: ItemCard } =>
        Boolean(entry.item && (entry.item.price >= 1000 || entry.item.rarity === 'legendary'))
      )
      .sort((a, b) => b.drop.createdAt - a.drop.createdAt)
      .slice(0, 12);
  }, [items, liveDrops]);

  return (
    <aside className="hidden w-[208px] shrink-0 border-r border-white/[0.06] bg-[#0B0D10] xl:block">
      <div className="sticky top-0 flex max-h-[calc(100vh-3.5rem)] flex-col px-3 py-4">
        <div className="mb-3 flex items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-300/10 text-amber-200">
            <Crown className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-black uppercase tracking-wider text-white">Топ-дропы</h2>
            <p className="text-[10px] text-slate-500">Недавние ценные карты</p>
          </div>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1" aria-live="polite" aria-label="Лента дорогих выпадений">
          {topDrops.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-slate-600" />
              <p className="text-[11px] leading-relaxed text-slate-500">Пока не выпало дорогих карточек</p>
            </div>
          ) : topDrops.map(({ drop, item }) => (
            <article
              key={drop.id}
              className={`overflow-hidden rounded-xl border ${rarityStyle[item.rarity]} transition-colors hover:border-white/25`}
            >
              <div className="relative flex h-[76px] items-center justify-center bg-gradient-to-br from-white/[0.06] to-black/20 p-2">
                <img
                  src={resolveAssetUrl(item.imageUrl)}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-contain drop-shadow-lg"
                />
                <span className="absolute bottom-1 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {drop.source === 'case' ? 'КЕЙС' : 'АПГРЕЙД'}
                </span>
                <time
                  className="absolute right-1.5 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-slate-300"
                  dateTime={new Date(drop.createdAt).toISOString()}
                  title={new Date(drop.createdAt).toLocaleString('ru-RU')}
                >
                  {new Date(drop.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <div className="space-y-1 px-2 py-1.5">
                <div className="truncate text-[11px] font-bold text-white" title={item.name}>{item.name}</div>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[9px] text-slate-400">{drop.userName}</span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-amber-200">{formatTC(item.price)} TC</span>
                </div>
                <div className="text-[9px] uppercase tracking-wide opacity-80">{RARITY_LABELS[item.rarity]}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
};

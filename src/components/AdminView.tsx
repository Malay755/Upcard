import React, { useState } from 'react';
import { CheckCircle2, Gift, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import type { CaseBox, ItemCard, Rarity } from '../types';
import {
  calculateCaseExpectedValue,
  formatTC,
  recommendedCasePrice,
  RARITY_LABELS,
} from '../utils/economics';
import { soundFX } from '../utils/sound';
import { CardFrame } from './CardFrame';
import { LegendaryRevealModal } from './LegendaryRevealModal';

interface AdminViewProps {
  items: ItemCard[];
  cases: CaseBox[];
  onCreateItem: (data: {
    name: string;
    rarity: Rarity;
    price: number;
    imageUrl: string;
    caseIds: string[];
  }) => Promise<ItemCard>;
  onDeleteItem: (id: string) => Promise<void>;
  onGrantItem: (itemId: string) => Promise<void>;
  onCreateCase: (data: {
    name: string;
    description: string;
    price: number;
    tier: Rarity;
    imageUrl: string;
    itemIds: string[];
    rarityWeights: Record<Rarity, number>;
  }) => Promise<void>;
}

const RARITY_OPTIONS: {
  id: Rarity;
  label: string;
  suggestedPrice: number;
  minPrice: number;
  maxPrice: number;
  dotColor: string;
  activeBorder: string;
}[] = [
  { id: 'common', label: 'Обычная (Серая)', minPrice: 50, maxPrice: 299, suggestedPrice: 180, dotColor: 'bg-slate-400', activeBorder: 'border-slate-400 bg-slate-400/15 text-white' },
  { id: 'rare', label: 'Редкая (Зеленая)', minPrice: 300, maxPrice: 999, suggestedPrice: 480, dotColor: 'bg-emerald-400', activeBorder: 'border-emerald-400 bg-emerald-500/15 text-emerald-200' },
  { id: 'epic', label: 'Эпическая (Фиолетовая)', minPrice: 1000, maxPrice: 4999, suggestedPrice: 2100, dotColor: 'bg-purple-400', activeBorder: 'border-purple-400 bg-purple-500/15 text-purple-200' },
  { id: 'legendary', label: 'Легендарная (Золотая)', minPrice: 5000, maxPrice: 250000, suggestedPrice: 8500, dotColor: 'bg-[#FACC15]', activeBorder: 'border-[#FACC15] bg-[#FACC15]/15 text-[#FEF08A]' },
];

const CASE_WEIGHTS_BY_TIER: Record<Rarity, Record<Rarity, number>> = {
  common: { common: 65, rare: 25, epic: 8, legendary: 2 },
  rare: { common: 15, rare: 60, epic: 20, legendary: 5 },
  epic: { common: 5, rare: 30, epic: 55, legendary: 10 },
  legendary: { common: 0, rare: 18, epic: 47, legendary: 35 },
};

export const AdminView: React.FC<AdminViewProps> = ({
  items,
  cases,
  onCreateItem,
  onDeleteItem,
  onGrantItem,
  onCreateCase,
}) => {
  const [name, setName] = useState('');
  const [rarity, setRarity] = useState<Rarity>('epic');
  const [price, setPrice] = useState<number>(2100);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [previewRevealOpen, setPreviewRevealOpen] = useState(false);

  // Custom Case Builder state
  const [caseName, setCaseName] = useState('');
  const [casePrice, setCasePrice] = useState(500);
  const [caseTier, setCaseTier] = useState<Rarity>('rare');
  const [caseItemIds, setCaseItemIds] = useState<string[]>([]);
  const [caseMsg, setCaseMsg] = useState('');
  const [caseErr, setCaseErr] = useState('');
  const selectedCaseItems = items.filter((item) => caseItemIds.includes(item.id));
  const minimumCasePrice = recommendedCasePrice(
    calculateCaseExpectedValue({ rarityWeights: CASE_WEIGHTS_BY_TIER[caseTier] }, selectedCaseItems)
  );

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, загрузите файл изображения (PNG, JPG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRarityPick = (opt: (typeof RARITY_OPTIONS)[number]) => {
    setRarity(opt.id);
    setPrice(opt.suggestedPrice);
  };

  const toggleCaseForItem = (id: string) => {
    setSelectedCaseIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    setSaving(true);
    try {
      const created = await onCreateItem({
        name,
        rarity,
        price,
        imageUrl,
        caseIds: selectedCaseIds,
      });
      soundFX.playCoin();
      setFeedback(`Готовая карта «${created.name}» добавлена в базу данных!`);
      setName('');
      setImageUrl('');
      setSelectedCaseIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения карточки.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaseErr('');
    setCaseMsg('');
    try {
      const minimumFairPrice = recommendedCasePrice(
        calculateCaseExpectedValue({ rarityWeights: CASE_WEIGHTS_BY_TIER[caseTier] }, selectedCaseItems)
      );
      const finalCasePrice = Math.max(casePrice, minimumFairPrice);
      await onCreateCase({
        name: caseName,
        description: `Авторский кейс (${RARITY_LABELS[caseTier]})`,
        price: finalCasePrice,
        tier: caseTier,
        imageUrl: '/src/assets/images/case_legend_crate_1794514881507.jpg',
        itemIds: caseItemIds,
        rarityWeights: CASE_WEIGHTS_BY_TIER[caseTier],
      });
      soundFX.playCoin();
      setCaseMsg(`Кейс «${caseName}» создан за ${formatTC(finalCasePrice)} TC. Цена согласована с шансами дропа.`);
      setCaseName('');
      setCaseItemIds([]);
    } catch (err) {
      setCaseErr(err instanceof Error ? err.message : 'Ошибка создания кейса.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
          Админ-панель: база готовых карточек и кейсов
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Система шаблонов отключена — карточки отображаются в оригинальной готовой рамке, выдаются в инвентарь и распределяются по кейсам напрямую.
        </p>
      </div>

      {/* Database Items Grid + Quick Grant */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-display font-bold text-white">
            База карточек ({items.length})
          </h2>
          <span className="text-xs text-slate-400">
            Можно выдать любую готовую карту в инвентарь для теста апгрейда
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4 flex flex-col items-center justify-between space-y-3"
            >
              <div className="flex flex-col items-center">
                <CardFrame item={item} size="sm" />
                <div className="mt-1 text-xs font-medium text-slate-200 text-center">
                  {item.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {RARITY_LABELS[item.rarity]}
                </div>
              </div>

              <div className="w-full flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    await onGrantItem(item.id);
                    soundFX.playCoin();
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-white/[0.07] hover:bg-[#FACC15]/20 hover:text-[#FACC15] text-xs font-medium text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>В инвентарь</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={`Удалить ${item.name}`}
                  className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add Pre-Rendered Card Directly (Zero Template Framing) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmitItem}
          className="lg:col-span-7 bg-[#14161A] border border-white/[0.06] rounded-xl p-6 space-y-5"
        >
          <div>
            <h2 className="text-lg font-display font-bold text-white">
              Добавить готовую карту в базу
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Загрузите уже оформленную картинку карты (без наложения шаблонной рамки).
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              1. Готовое изображение карты (PNG/JPG/WebP)
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label
                htmlFor="admin-file-upload"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 bg-[#0D0F12] hover:border-[#FACC15] text-xs text-slate-300 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-[#FACC15]" />
                <span>Загрузить файл с устройства</span>
                <input
                  id="admin-file-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                />
              </label>

              <input
                type="url"
                value={imageUrl.startsWith('data:') ? '' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Или вставьте путь / URL готовой карты..."
                aria-label="URL готовой карты"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-xs text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-item-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                2. Название карты
              </label>
              <input
                id="admin-item-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Ваня Дрипчик"
                className="w-full px-4 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label htmlFor="admin-item-price" className="block text-xs font-medium text-slate-300 mb-1.5">
                3. Цена (Т-коин)
              </label>
              <input
                id="admin-item-price"
                type="number"
                min={RARITY_OPTIONS.find((option) => option.id === rarity)?.minPrice}
                max={RARITY_OPTIONS.find((option) => option.id === rarity)?.maxPrice}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-sm text-white font-mono-num focus:outline-none focus:border-[#FACC15]"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300 mb-2">
              4. Редкость карты (для шансов дропа и фильтров)
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {RARITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleRarityPick(opt)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    rarity === opt.id
                      ? opt.activeBorder
                      : 'bg-[#0D0F12] border-white/[0.08] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${opt.dotColor}`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300 mb-2">
              5. Добавить сразу в кейсы (необязательно)
            </span>
            <div className="flex flex-wrap gap-2">
              {cases.map((c) => {
                const checked = selectedCaseIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCaseForItem(c.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                        : 'bg-[#0D0F12] border-white/[0.08] text-slate-400 hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {feedback && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-6 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] disabled:opacity-50 text-[#0B0D10] font-display font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Сохраняем...' : 'Добавить карту в базу данных'}</span>
          </button>
        </form>

        {/* Direct Live Preview (Clean Finished Artwork) */}
        <div className="lg:col-span-5 bg-[#14161A] border border-white/[0.06] rounded-xl p-6 flex flex-col items-center space-y-5">
          <div className="w-full flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-bold text-white">
                Предпросмотр карты
              </h2>
              <p className="text-[11px] text-slate-400">
                Как карта будет выглядеть на сайте
              </p>
            </div>
            <span className="text-xs text-[#FACC15] font-medium">{RARITY_LABELS[rarity]}</span>
          </div>

          <div className="py-2 flex justify-center">
            <CardFrame
              item={{
                name: name.trim() || 'НОВАЯ КАРТА',
                rarity,
                price: price || 0,
                imageUrl,
              }}
              size="lg"
            />
          </div>

          {rarity === 'legendary' && imageUrl && (
            <button
              type="button"
              onClick={() => {
                soundFX.playItemDropSound('legendary');
                soundFX.playLegendaryRevealSound();
                setPreviewRevealOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FACC15]/15 hover:bg-[#FACC15]/25 border border-[#FACC15]/40 text-xs font-semibold text-[#FACC15] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Тест 3D-анимации выпадения</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom Case Creator */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-display font-bold text-white">
          Создать свой кейс
        </h2>

        <form onSubmit={handleCreateCase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="admin-case-name" className="block text-xs text-slate-300 mb-1">
                Название кейса
              </label>
              <input
                id="admin-case-name"
                type="text"
                value={caseName}
                onChange={(e) => setCaseName(e.target.value)}
                placeholder="Например, Кейс Сквада"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label htmlFor="admin-case-price" className="block text-xs text-slate-300 mb-1">
                Цена открытия (TC)
              </label>
              <input
                id="admin-case-price"
                type="number"
                min={50}
                value={casePrice}
                onChange={(e) => setCasePrice(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-sm text-white font-mono-num focus:outline-none focus:border-[#FACC15]"
              />
              {minimumCasePrice > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Минимум по таблице дропа: {formatTC(minimumCasePrice)} TC
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-case-tier" className="block text-xs text-slate-300 mb-1">
                Баланс редкости кейса
              </label>
              <select
                id="admin-case-tier"
                value={caseTier}
                onChange={(e) => setCaseTier(e.target.value as Rarity)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-sm text-white focus:outline-none focus:border-[#FACC15]"
              >
                <option value="rare">Редкий (зеленый уклон)</option>
                <option value="epic">Эпический (фиолетовый уклон)</option>
                <option value="legendary">Легендарный (высокий шанс золота)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300 mb-2">
              Выберите минимум 2 карточки для дропа ({caseItemIds.length} выбрано):
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((it) => {
                const active = caseItemIds.includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() =>
                      setCaseItemIds((prev) =>
                        prev.includes(it.id) ? prev.filter((x) => x !== it.id) : [...prev, it.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                        : 'bg-[#0D0F12] border-white/[0.08] text-slate-400 hover:text-white'
                    }`}
                  >
                    {it.name} ({formatTC(it.price)} TC)
                  </button>
                );
              })}
            </div>
          </div>

          {caseErr && <p className="text-xs text-rose-400">{caseErr}</p>}
          {caseMsg && <p className="text-xs text-emerald-400">{caseMsg}</p>}

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Сохранить новый кейс
          </button>
        </form>
      </section>

      <LegendaryRevealModal
        item={
          previewRevealOpen && imageUrl
            ? {
                id: 'preview_legendary',
                name: name.trim() || 'НОВАЯ КАРТА',
                rarity: 'legendary',
                price: price || 0,
                imageUrl,
                createdAt: Date.now(),
              }
            : null
        }
        sourceLabel="Предпросмотр 3D-выпадения"
        onClose={() => setPreviewRevealOpen(false)}
      />
    </div>
  );
};

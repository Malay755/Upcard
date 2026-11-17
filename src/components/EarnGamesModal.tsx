import React, { useEffect, useState } from 'react';
import { ArrowLeft, Car, Clock, Coins, Gamepad2, ShieldAlert, Sparkles, X } from 'lucide-react';
import tenetRiderCover from '../assets/images/tenet_rider_cover_1794862143521.jpg';
import type { MinesBoardState, MinigameEnergySlot, MinigameId, MinigameStatusMap } from '../types';
import { formatTC } from '../utils/economics';
import { PtuMinesGame } from './minigames/PtuMinesGame';
import { TenetRaceGame } from './minigames/TenetRaceGame';
import { TimurHarvestGame } from './minigames/TimurHarvestGame';

interface EarnGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  minigames?: MinigameStatusMap;
  userBalance: number;
  isAuthorized: boolean;
  onRequireAuth: () => void;
  onStartHarvest: () => Promise<{ sessionId: string; durationMs: number }>;
  onFinishHarvest: (sessionId: string, score: number, hits: number) => Promise<{ reward: number; bestScore: number }>;
  onStartMines: () => Promise<MinesBoardState>;
  onStepMines: (sessionId: string, cellIndex: number) => Promise<{ board: MinesBoardState; stepBonus?: number; reward: number }>;
  onCashoutMines: (sessionId: string) => Promise<{ board: MinesBoardState; reward: number }>;
  onStartRace: () => Promise<{ sessionId: string; durationMs: number }>;
  onFinishRace: (
    sessionId: string,
    coinsCollected: number,
    distanceMeters: number,
    nearMisses: number,
    survived: boolean
  ) => Promise<{ reward: number; bestScore: number }>;
}

const DEFAULT_SLOT: MinigameEnergySlot = {
  charges: 3,
  maxCharges: 3,
  nextRechargeAt: null,
  bestScore: 0,
  playsCount: 0,
};

const GAMES_CATALOG: {
  id: MinigameId;
  title: string;
  meta: string;
  description: string;
  imageUrl: string;
  fallbackIcon: 'harvest' | 'mines' | 'race';
}[] = [
  {
    id: 'harvest',
    title: 'Урожай на Ферме',
    meta: 'Тайминг-кликер · 20 сек · до 480 TC',
    description: 'Тапай по Тимуру Козлику, набивай серию и избегай ядовитых сорняков.',
    imageUrl: '/assets/aistudio/____________92a0b64a.png',
    fallbackIcon: 'harvest',
  },
  {
    id: 'mines',
    title: 'Минное поле ПТУ',
    meta: 'PvE-сапёр 4×4 · 3 ловушки · до 1 100 TC',
    description: 'Бесплатный вход: открывай сейфы с монетами и забирай банк в любой момент.',
    imageUrl: '/assets/aistudio/____________b9c27c9f.png',
    fallbackIcon: 'mines',
  },
  {
    id: 'race',
    title: 'Гонка на TENET T4',
    meta: '3D Traffic Rider · 4 полосы · до 600 TC',
    description: 'Скорость 3D TENET T4 постоянно растёт! Объезжай поток, шипы и масляные лужи, делай плотные обгоны (+15 TC)!',
    imageUrl: tenetRiderCover,
    fallbackIcon: 'race',
  },
];

function formatDailyCountdown(nextRechargeAt: number | null, nowMs: number): string | null {
  if (!nextRechargeAt || nextRechargeAt <= nowMs) return null;
  const totalSec = Math.ceil((nextRechargeAt - nowMs) / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const EarnGamesModal: React.FC<EarnGamesModalProps> = ({
  isOpen,
  onClose,
  minigames,
  userBalance,
  isAuthorized,
  onRequireAuth,
  onStartHarvest,
  onFinishHarvest,
  onStartMines,
  onStepMines,
  onCashoutMines,
  onStartRace,
  onFinishRace,
}) => {
  const [selectedGame, setSelectedGame] = useState<MinigameId | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setSelectedGame(null);
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getSlot = (id: MinigameId): MinigameEnergySlot => minigames?.[id] ?? DEFAULT_SLOT;
  const activeMeta = GAMES_CATALOG.find((g) => g.id === selectedGame);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto ${
        selectedGame === 'race' ? 'bg-black/85' : 'bg-black/80 backdrop-blur-sm'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="earn-games-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#14161A] p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedGame ? (
              <button
                type="button"
                onClick={() => setSelectedGame(null)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs font-display font-bold text-slate-200 hover:bg-white/[0.1] cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>К играм</span>
              </button>
            ) : (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#FACC15]/15 text-[#FACC15] shrink-0">
                <Gamepad2 className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id="earn-games-modal-title" className="font-display text-base sm:text-lg font-extrabold text-white truncate">
                {activeMeta ? activeMeta.title : 'Заработать TC'}
              </h2>
              <p className="text-xs text-slate-400 font-mono-num">
                Баланс: <span className="font-bold text-[#FACC15]">{formatTC(userBalance)} TC</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hub Catalog */}
        {!selectedGame && (
          <div className="space-y-3">
            {!isAuthorized && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-xs text-amber-100">
                <span>Войди через Telegram, чтобы сохранять заработанные TC на баланс.</span>
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="rounded-lg bg-[#FACC15] px-3 py-1.5 font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
                >
                  Войти
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {GAMES_CATALOG.map((game) => {
                const slot = getSlot(game.id);
                const countdown = slot.charges < slot.maxCharges ? formatDailyCountdown(slot.nextRechargeAt, nowMs) : null;

                return (
                  <div
                    key={game.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border border-white/[0.07] bg-[#0D0F12] p-3.5 hover:border-white/[0.14] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="h-16 w-24 sm:h-[72px] sm:w-[108px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0B0D10] flex items-center justify-center">
                        {!brokenThumbs[game.id] ? (
                          <img
                            src={game.imageUrl}
                            alt={game.title}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenThumbs((prev) => ({ ...prev, [game.id]: true }))}
                            className="h-full w-full object-contain"
                          />
                        ) : game.fallbackIcon === 'mines' ? (
                          <ShieldAlert className="h-6 w-6 text-rose-400" />
                        ) : game.fallbackIcon === 'race' ? (
                          <Car className="h-6 w-6 text-[#FACC15]" />
                        ) : (
                          <Sparkles className="h-6 w-6 text-emerald-400" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <h3 className="font-display text-sm sm:text-base font-bold text-white truncate">
                          {game.title}
                        </h3>
                        <p className="text-[11px] font-mono-num text-[#FACC15]/90">{game.meta}</p>
                        <p className="text-xs text-slate-400 line-clamp-2">{game.description}</p>
                        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] font-mono-num text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-flex gap-1 mr-0.5">
                              {Array.from({ length: slot.maxCharges }, (_, idx) => (
                                <span
                                  key={idx}
                                  className={`h-2 w-2 rounded-full ${
                                    idx < slot.charges ? 'bg-[#FACC15]' : 'bg-white/15'
                                  }`}
                                />
                              ))}
                            </span>
                            {slot.charges}/{slot.maxCharges} сегодня
                          </span>
                          {countdown && (
                            <span className="inline-flex items-center gap-1 text-slate-300">
                              <Clock className="h-3 w-3" />Обновление через {countdown}
                            </span>
                          )}
                          {slot.bestScore > 0 && (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <Coins className="h-3 w-3" />Рекорд {formatTC(slot.bestScore)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedGame(game.id)}
                      className="min-h-[44px] sm:min-w-[116px] shrink-0 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] px-4 py-2.5 text-xs sm:text-sm font-display font-bold text-[#0B0D10] transition-colors cursor-pointer"
                    >
                      Играть
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-center text-slate-500 font-mono-num">
              Максимум 3 попытки в день на каждую игру · сброс ежедневно в 00:00 МСК
            </p>
          </div>
        )}

        {/* Active Mini-Game Views */}
        {selectedGame === 'harvest' && (
          <TimurHarvestGame
            energy={getSlot('harvest')}
            isAuthorized={isAuthorized}
            onRequireAuth={onRequireAuth}
            onStart={onStartHarvest}
            onFinish={onFinishHarvest}
            onBack={() => setSelectedGame(null)}
          />
        )}

        {selectedGame === 'mines' && (
          <PtuMinesGame
            energy={getSlot('mines')}
            isAuthorized={isAuthorized}
            onRequireAuth={onRequireAuth}
            onStart={onStartMines}
            onStep={onStepMines}
            onCashout={onCashoutMines}
            onBack={() => setSelectedGame(null)}
          />
        )}

        {selectedGame === 'race' && (
          <TenetRaceGame
            energy={getSlot('race')}
            isAuthorized={isAuthorized}
            onRequireAuth={onRequireAuth}
            onStart={onStartRace}
            onFinish={onFinishRace}
            onBack={() => setSelectedGame(null)}
          />
        )}
      </div>
    </div>
  );
};

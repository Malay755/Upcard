import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Flame, Play, RotateCcw, Skull, Sparkles } from 'lucide-react';
import type { MinigameEnergySlot } from '../../types';
import { formatTC } from '../../utils/economics';
import { soundFX } from '../../utils/sound';

interface TimurHarvestGameProps {
  energy: MinigameEnergySlot;
  isAuthorized: boolean;
  onRequireAuth: () => void;
  onStart: () => Promise<{ sessionId: string; durationMs: number }>;
  onFinish: (sessionId: string, score: number, hits: number) => Promise<{ reward: number; bestScore: number }>;
  onBack: () => void;
}

type SlotKind = 'normal' | 'gold' | 'trap';

interface PastureSlot {
  active: boolean;
  kind: SlotKind;
  expiresAt: number;
  spawnId: number;
}

interface FloatingFeedback {
  id: number;
  cellIndex: number;
  text: string;
  tone: 'good' | 'gold' | 'bad';
}

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

const TIMUR_GOAT_IMG = '/assets/aistudio/____________92a0b64a.png';
const EMPTY_SLOTS: PastureSlot[] = Array.from({ length: 9 }, () => ({
  active: false,
  kind: 'normal',
  expiresAt: 0,
  spawnId: 0,
}));

export const TimurHarvestGame: React.FC<TimurHarvestGameProps> = ({
  energy,
  isAuthorized,
  onRequireAuth,
  onStart,
  onFinish,
  onBack,
}) => {
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [slots, setSlots] = useState<PastureSlot[]>(EMPTY_SLOTS);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(20_000);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [finalReward, setFinalReward] = useState<number | null>(null);
  const [feedbacks, setFeedbacks] = useState<FloatingFeedback[]>([]);
  const [imgBroken, setImgBroken] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const durationMsRef = useRef(20_000);
  const startedAtRef = useRef(0);
  const scoreRef = useRef(0);
  const hitsRef = useRef(0);
  const comboRef = useRef(0);
  const finishingRef = useRef(false);
  const spawnCounterRef = useRef(1);
  const feedbackIdRef = useRef(1);
  const nextSpawnAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    finishingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const pushFeedback = (cellIndex: number, text: string, tone: FloatingFeedback['tone']) => {
    const id = feedbackIdRef.current++;
    setFeedbacks((prev) => [...prev.slice(-6), { id, cellIndex, text, tone }]);
    window.setTimeout(() => {
      setFeedbacks((prev) => prev.filter((item) => item.id !== id));
    }, 550);
  };

  const finishRound = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const sid = sessionIdRef.current;
    setSlots(EMPTY_SLOTS);
    setBusy(true);

    try {
      if (!sid) {
        setPhase('ROUND_SUMMARY');
        setFinalReward(0);
        return;
      }
      const res = await onFinish(sid, scoreRef.current, hitsRef.current);
      setFinalReward(res.reward);
      setPhase('ROUND_SUMMARY');
      if (res.reward > 0) {
        soundFX.playWheelWinFanfare(res.reward >= 350);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось зафиксировать урожай.');
      setPhase('ROUND_SUMMARY');
      setFinalReward(0);
    } finally {
      sessionIdRef.current = null;
      setBusy(false);
    }
  }, [onFinish]);

  const startRound = async () => {
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    if (energy.charges <= 0 || busy) return;

    setErrorMsg('');
    setBusy(true);
    try {
      const started = await onStart();
      sessionIdRef.current = started.sessionId;
      durationMsRef.current = Math.max(20_000, started.durationMs);
      startedAtRef.current = Date.now();
      scoreRef.current = 0;
      hitsRef.current = 0;
      comboRef.current = 0;
      finishingRef.current = false;
      nextSpawnAtRef.current = Date.now() + 180;

      setScore(0);
      setHits(0);
      setCombo(0);
      setFinalReward(null);
      setTimeLeftMs(durationMsRef.current);
      setSlots(EMPTY_SLOTS);
      setPhase('PLAYING');
      soundFX.playWheelStart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось запустить игру.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== 'PLAYING') return;

    const tick = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - startedAtRef.current;
      const remaining = Math.max(0, durationMsRef.current - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        window.clearInterval(tick);
        void finishRound();
        return;
      }

      setSlots((prev) => {
        let changed = false;
        const next = prev.map((slot) => {
          if (slot.active && now >= slot.expiresAt) {
            changed = true;
            return { ...slot, active: false };
          }
          return slot;
        });

        const activeCount = next.filter((s) => s.active).length;
        if (now >= nextSpawnAtRef.current && activeCount < 3) {
          const freeIndices = next
            .map((s, idx) => (s.active ? -1 : idx))
            .filter((idx) => idx !== -1);

          if (freeIndices.length > 0) {
            const pick = freeIndices[Math.floor(Math.random() * freeIndices.length)];
            const roll = Math.random();
            const kind: SlotKind = roll < 0.21 ? 'trap' : roll < 0.39 ? 'gold' : 'normal';
            const speedBoost = Math.min(320, Math.floor(elapsed / 20_000 * 300));
            const ttl = (kind === 'gold' ? 920 : 1220) - speedBoost;
            next[pick] = {
              active: true,
              kind,
              expiresAt: now + ttl,
              spawnId: spawnCounterRef.current++,
            };
            changed = true;
          }
          nextSpawnAtRef.current = now + Math.max(330, 560 - Math.floor((elapsed / 20_000) * 190));
        }

        return changed ? next : prev;
      });
    }, 80);

    return () => window.clearInterval(tick);
  }, [phase, finishRound]);

  const handleTapCell = (index: number) => {
    if (phase !== 'PLAYING' || finishingRef.current) return;
    const target = slots[index];
    if (!target || !target.active) return;

    setSlots((prev) => prev.map((s, idx) => (idx === index ? { ...s, active: false } : s)));

    if (target.kind === 'trap') {
      comboRef.current = 0;
      scoreRef.current = Math.max(0, scoreRef.current - 25);
      setCombo(0);
      setScore(scoreRef.current);
      pushFeedback(index, 'ЯД -25', 'bad');
      soundFX.playMiniTrap();
      return;
    }

    const nextCombo = comboRef.current + 1;
    comboRef.current = nextCombo;
    hitsRef.current += 1;
    const multiplier = nextCombo >= 10 ? 2.0 : nextCombo >= 6 ? 1.5 : nextCombo >= 3 ? 1.25 : 1;
    const delta = target.kind === 'gold' ? 45 : Math.round(15 * multiplier);
    scoreRef.current = Math.min(480, scoreRef.current + delta);

    setCombo(nextCombo);
    setHits(hitsRef.current);
    setScore(scoreRef.current);
    pushFeedback(index, `+${delta} TC`, target.kind === 'gold' ? 'gold' : 'good');
    if (target.kind === 'gold') {
      soundFX.playCoin();
    } else {
      soundFX.playMiniTap(nextCombo);
    }
  };

  const multiplierLabel =
    combo >= 10 ? 'x2.0' : combo >= 6 ? 'x1.5' : combo >= 3 ? 'x1.25' : 'x1.0';

  return (
    <div className="space-y-4 select-none">
      {/* Live Scoreboard Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0D0F12] px-4 py-3 text-xs sm:text-sm">
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Таймер</span>
            <span className="font-mono-num font-bold text-white">
              {(timeLeftMs / 1000).toFixed(1)}с
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Урожай</span>
            <span className="font-mono-num font-bold text-[#FACC15]">{formatTC(score)} TC</span>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono-num text-xs">
          <span className={`inline-flex items-center gap-1 font-bold ${combo >= 3 ? 'text-emerald-400' : 'text-slate-400'}`}>
            <Flame className="h-3.5 w-3.5" />
            Серия {combo} ({multiplierLabel})
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">Попытки {energy.charges}/{energy.maxCharges}</span>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {phase === 'TITLE_MENU' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-5 text-center space-y-4">
          <div className="mx-auto relative h-28 w-44 overflow-hidden rounded-xl border border-emerald-400/25 bg-[#161920]">
            {!imgBroken ? (
              <img
                src={TIMUR_GOAT_IMG}
                alt="Тимур Козлик на пастбище"
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-emerald-300">
                Тимур Козлик
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-extrabold text-white">Урожай на Ферме</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              20 секунд на сбор урожая: тапай по Тимуру Козлику (<span className="text-emerald-300 font-semibold">+15 TC</span>) и Золотому Козлику (<span className="text-[#FACC15] font-semibold">+45 TC</span>), держи серию без промаха и не трогай сорняк «ЯД» (<span className="text-rose-400 font-semibold">-25 TC</span>). Максимум <span className="font-mono-num text-white">480 TC</span> за раунд.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={startRound}
              disabled={busy || (isAuthorized && energy.charges <= 0)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 transition-colors cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>
                {!isAuthorized
                  ? 'Войти и начать'
                  : energy.charges <= 0
                  ? 'Нет попыток'
                  : busy
                  ? 'Запуск...'
                  : 'Начать сбор (20с)'}
              </span>
            </button>
          </div>
        </div>
      )}

      {phase === 'PLAYING' && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 rounded-xl border border-white/[0.07] bg-[#0D0F12] p-3 sm:p-4">
          {slots.map((slot, index) => {
            const activeFeedback = feedbacks.filter((f) => f.cellIndex === index).slice(-1)[0];
            const isGold = slot.active && slot.kind === 'gold';
            const isTrap = slot.active && slot.kind === 'trap';

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleTapCell(index)}
                style={{ touchAction: 'manipulation' }}
                aria-label={
                  !slot.active
                    ? `Грядка ${index + 1}`
                    : isTrap
                    ? 'Ловушка ЯД'
                    : isGold
                    ? 'Золотой Тимур Козлик'
                    : 'Тимур Козлик'
                }
                className={`relative min-h-[92px] sm:min-h-[108px] rounded-xl border transition-transform active:scale-95 overflow-hidden flex flex-col items-center justify-center cursor-pointer ${
                  !slot.active
                    ? 'border-white/[0.06] bg-[#14171D]'
                    : isTrap
                    ? 'border-rose-500 bg-rose-950/55 shadow-[0_0_20px_rgba(244,63,94,0.22)]'
                    : isGold
                    ? 'border-[#FACC15] bg-amber-950/35 shadow-[0_0_24px_rgba(250,204,21,0.28)]'
                    : 'border-emerald-400/60 bg-emerald-950/25 shadow-[0_0_16px_rgba(16,185,129,0.18)]'
                }`}
              >
                {!slot.active ? (
                  <span className="h-3 w-10 rounded-full bg-white/[0.05]" />
                ) : isTrap ? (
                  <div className="flex flex-col items-center gap-1 text-rose-300">
                    <Skull className="h-7 w-7 text-rose-400" />
                    <span className="text-[11px] font-display font-extrabold tracking-wider uppercase">
                      ЯД · -25
                    </span>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center justify-center w-full h-full p-1">
                    {!imgBroken ? (
                      <img
                        src={TIMUR_GOAT_IMG}
                        alt="Тимур Козлик"
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className={`h-14 w-14 sm:h-16 sm:w-16 rounded-full object-cover border-2 ${
                          isGold ? 'border-[#FACC15] brightness-110 saturate-125' : 'border-emerald-400'
                        }`}
                      />
                    ) : (
                      <span className="text-xs font-bold text-white">Тимур</span>
                    )}
                    <span
                      className={`mt-1 text-[10px] font-mono-num font-bold leading-none ${
                        isGold ? 'text-[#FACC15]' : 'text-emerald-300'
                      }`}
                    >
                      {isGold ? '+45 TC ★' : '+15 TC'}
                    </span>
                  </div>
                )}

                {activeFeedback && (
                  <span
                    className={`pointer-events-none absolute top-1.5 right-2 text-xs font-mono-num font-black animate-bounce ${
                      activeFeedback.tone === 'bad'
                        ? 'text-rose-400'
                        : activeFeedback.tone === 'gold'
                        ? 'text-[#FACC15]'
                        : 'text-emerald-300'
                    }`}
                  >
                    {activeFeedback.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {phase === 'ROUND_SUMMARY' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-6 text-center space-y-4">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FACC15]/15 text-[#FACC15]">
            {finalReward && finalReward > 0 ? <Sparkles className="h-6 w-6" /> : <Coins className="h-6 w-6" />}
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-display font-bold">
              Урожай собран
            </p>
            <p className="font-mono-num text-3xl font-extrabold text-[#FACC15]">
              +{formatTC(finalReward ?? 0)} TC
            </p>
            <p className="text-xs text-slate-400 font-mono-num">
              Точных тапов: {hits} · Рекорд: {formatTC(Math.max(energy.bestScore, finalReward ?? 0))} TC
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {energy.charges > 0 && (
              <button
                type="button"
                onClick={startRound}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#FACC15] px-5 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Ещё раунд ({energy.charges}/{energy.maxCharges})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-display font-bold text-white hover:bg-white/[0.12] cursor-pointer"
            >
              К выбору игр
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

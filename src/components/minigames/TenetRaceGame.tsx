import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Car, Heart, Play, RotateCcw, Trophy } from 'lucide-react';
import type { MinigameEnergySlot } from '../../types';
import { formatTC } from '../../utils/economics';
import { soundFX } from '../../utils/sound';

interface TenetRaceGameProps {
  energy: MinigameEnergySlot;
  isAuthorized: boolean;
  onRequireAuth: () => void;
  onStart: () => Promise<{ sessionId: string; durationMs: number }>;
  onFinish: (
    sessionId: string,
    coinsCollected: number,
    distanceMeters: number,
    survived: boolean
  ) => Promise<{ reward: number; bestScore: number }>;
  onBack: () => void;
}

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

interface RoadEntity {
  id: number;
  lane: 0 | 1 | 2;
  y: number;
  kind: 'coin' | 'hazard';
  collected?: boolean;
}

const TENET_CAR_IMG = '/assets/cards/tenet_t4.png';

export const TenetRaceGame: React.FC<TenetRaceGameProps> = ({
  energy,
  isAuthorized,
  onRequireAuth,
  onStart,
  onFinish,
  onBack,
}) => {
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [hp, setHp] = useState(2);
  const [coins, setCoins] = useState(0);
  const [distance, setDistance] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(25_000);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [finalReward, setFinalReward] = useState<number | null>(null);
  const [didSurvive, setDidSurvive] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const durationMsRef = useRef(25_000);
  const startTimeRef = useRef(0);
  const targetLaneRef = useRef<0 | 1 | 2>(1);
  const visualLaneRef = useRef(1);
  const hpRef = useRef(2);
  const invulnUntilRef = useRef(0);
  const coinsRef = useRef(0);
  const distanceRef = useRef(0);
  const entitiesRef = useRef<RoadEntity[]>([]);
  const spawnTimerRef = useRef(0);
  const entitySeqRef = useRef(1);
  const roadOffsetRef = useRef(0);
  const finishingRef = useRef(false);

  const moveLane = useCallback((delta: -1 | 1) => {
    if (phase !== 'PLAYING') return;
    const next = Math.max(0, Math.min(2, targetLaneRef.current + delta)) as 0 | 1 | 2;
    if (next !== targetLaneRef.current) {
      targetLaneRef.current = next;
      soundFX.playCaseTick(0.2);
    }
  }, [phase]);

  const finishRace = useCallback(async (survived: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    const sid = sessionIdRef.current;
    setDidSurvive(survived);
    setBusy(true);
    try {
      if (!sid) {
        setFinalReward(0);
        setPhase('ROUND_SUMMARY');
        return;
      }
      const res = await onFinish(
        sid,
        coinsRef.current,
        Math.round(distanceRef.current),
        survived
      );
      setFinalReward(res.reward);
      setPhase('ROUND_SUMMARY');
      if (survived || res.reward >= 160) {
        soundFX.playWheelWinFanfare(res.reward >= 320);
      } else {
        soundFX.playCoin();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось завершить заезд.');
      setFinalReward(0);
      setPhase('ROUND_SUMMARY');
    } finally {
      sessionIdRef.current = null;
      setBusy(false);
    }
  }, [onFinish]);

  const startRace = async () => {
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
      durationMsRef.current = Math.max(25_000, started.durationMs);
      startTimeRef.current = performance.now();
      targetLaneRef.current = 1;
      visualLaneRef.current = 1;
      hpRef.current = 2;
      invulnUntilRef.current = 0;
      coinsRef.current = 0;
      distanceRef.current = 0;
      entitiesRef.current = [];
      spawnTimerRef.current = 0;
      roadOffsetRef.current = 0;
      finishingRef.current = false;

      setHp(2);
      setCoins(0);
      setDistance(0);
      setFinalReward(null);
      setTimeLeftMs(durationMsRef.current);
      setPhase('PLAYING');
      soundFX.playWheelStart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось запустить гонку.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== 'PLAYING') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') {
        e.preventDefault();
        moveLane(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') {
        e.preventDefault();
        moveLane(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, moveLane]);

  useEffect(() => {
    if (phase !== 'PLAYING') return;
    let lastTs = performance.now();
    let hudSyncAt = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const elapsed = now - startTimeRef.current;
      const remaining = Math.max(0, durationMsRef.current - elapsed);
      const speedPxPerSec = 250 + Math.min(180, (elapsed / durationMsRef.current) * 170);

      roadOffsetRef.current = (roadOffsetRef.current + speedPxPerSec * dt) % 48;
      distanceRef.current += (speedPxPerSec * dt) / 9.5;
      visualLaneRef.current += (targetLaneRef.current - visualLaneRef.current) * Math.min(1, dt * 16);

      // Spawn obstacles & coins cleanly without blocking all 3 lanes
      spawnTimerRef.current -= dt;
      if (spawnTimerRef.current <= 0) {
        const roll = Math.random();
        const laneA = Math.floor(Math.random() * 3) as 0 | 1 | 2;
        if (roll < 0.45) {
          entitiesRef.current.push({
            id: entitySeqRef.current++,
            lane: laneA,
            y: -34,
            kind: 'coin',
          });
        } else {
          entitiesRef.current.push({
            id: entitySeqRef.current++,
            lane: laneA,
            y: -36,
            kind: 'hazard',
          });
          // Companion coin on a different lane 55% of the time
          if (Math.random() < 0.55) {
            const safeLanes = ([0, 1, 2] as const).filter((l) => l !== laneA);
            const coinLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
            entitiesRef.current.push({
              id: entitySeqRef.current++,
              lane: coinLane,
              y: -34,
              kind: 'coin',
            });
          }
        }
        spawnTimerRef.current = Math.max(0.46, 0.78 - (elapsed / durationMsRef.current) * 0.25);
      }

      const canvas = canvasRef.current;
      const logicalW = 420;
      const logicalH = 300;
      const roadLeft = 42;
      const roadWidth = logicalW - roadLeft * 2;
      const laneW = roadWidth / 3;
      const carY = logicalH - 64;
      const carLaneX = (laneVal: number) => roadLeft + laneW * (laneVal + 0.5);

      // Move entities & detect collisions
      const kept: RoadEntity[] = [];
      for (const ent of entitiesRef.current) {
        ent.y += speedPxPerSec * dt;
        if (ent.collected || ent.y > logicalH + 44) continue;

        const dx = Math.abs(visualLaneRef.current - ent.lane);
        const dy = Math.abs(ent.y - carY);
        if (dx < 0.44 && dy < 30) {
          if (ent.kind === 'coin') {
            ent.collected = true;
            coinsRef.current += 1;
            setCoins(coinsRef.current);
            soundFX.playMiniTap(coinsRef.current);
            continue;
          } else if (now > invulnUntilRef.current) {
            ent.collected = true;
            hpRef.current -= 1;
            invulnUntilRef.current = now + 950;
            setHp(hpRef.current);
            soundFX.playMiniTrap();
            if (hpRef.current <= 0) {
              setDistance(Math.round(distanceRef.current));
              void finishRace(false);
              return;
            }
            continue;
          }
        }
        kept.push(ent);
      }
      entitiesRef.current = kept;

      if (now - hudSyncAt > 90) {
        hudSyncAt = now;
        setTimeLeftMs(remaining);
        setDistance(Math.round(distanceRef.current));
      }

      if (remaining <= 0) {
        setTimeLeftMs(0);
        setDistance(Math.round(distanceRef.current));
        void finishRace(true);
        return;
      }

      // Draw canvas
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== logicalW * dpr || canvas.height !== logicalH * dpr) {
          canvas.width = logicalW * dpr;
          canvas.height = logicalH * dpr;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // Grass/shoulder backdrop
          ctx.fillStyle = '#090B0E';
          ctx.fillRect(0, 0, logicalW, logicalH);

          // Road asphalt
          ctx.fillStyle = '#151921';
          ctx.fillRect(roadLeft, 0, roadWidth, logicalH);

          // Curbs
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(roadLeft - 3, 0, 3, logicalH);
          ctx.fillRect(roadLeft + roadWidth, 0, 3, logicalH);

          // Dashed lane dividers
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.lineWidth = 2;
          ctx.setLineDash([22, 26]);
          ctx.lineDashOffset = -roadOffsetRef.current;
          for (let l = 1; l <= 2; l++) {
            const x = roadLeft + laneW * l;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, logicalH);
            ctx.stroke();
          }
          ctx.setLineDash([]);

          // Draw entities
          for (const ent of entitiesRef.current) {
            const ex = carLaneX(ent.lane);
            if (ent.kind === 'coin') {
              ctx.save();
              ctx.fillStyle = '#FACC15';
              ctx.beginPath();
              ctx.arc(ex, ent.y, 13, 0, Math.PI * 2);
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#FEF08A';
              ctx.stroke();
              ctx.fillStyle = '#0B0D10';
              ctx.font = 'bold 12px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('T', ex, ent.y + 0.5);
              ctx.restore();
            } else {
              // Striped hazard barrier + exclamation mark (non-hue-only cue)
              ctx.save();
              ctx.fillStyle = '#E11D48';
              ctx.strokeStyle = '#FDA4AF';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.roundRect(ex - 26, ent.y - 12, 52, 24, 6);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#FFFFFF';
              ctx.font = 'bold 11px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('! ЯМА', ex, ent.y + 0.5);
              ctx.restore();
            }
          }

          // Draw player's TENET T4 SUV
          const blinking = now < invulnUntilRef.current && Math.floor(now / 80) % 2 === 0;
          if (!blinking) {
            const cx = carLaneX(visualLaneRef.current);
            // Headlight glow cones
            const grad = ctx.createLinearGradient(cx, carY - 26, cx, carY - 96);
            grad.addColorStop(0, 'rgba(250, 204, 21, 0.25)');
            grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(cx - 18, carY - 26);
            ctx.lineTo(cx - 34, carY - 96);
            ctx.lineTo(cx + 34, carY - 96);
            ctx.lineTo(cx + 18, carY - 26);
            ctx.closePath();
            ctx.fill();

            // SUV Body
            ctx.fillStyle = '#252B36';
            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(cx - 21, carY - 30, 42, 60, 10);
            ctx.fill();
            ctx.stroke();

            // Windshield
            ctx.fillStyle = '#0B0F17';
            ctx.beginPath();
            ctx.roundRect(cx - 15, carY - 16, 30, 16, 4);
            ctx.fill();

            // Roof badge
            ctx.fillStyle = '#FACC15';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('TENET T4', cx, carY + 12);

            // Red LED tail light bar
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(cx - 16, carY + 25, 32, 3);
          }

          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, finishRace]);

  const estimatedPreview = Math.min(500, coins * 20 + Math.min(80, Math.floor(distance / 14)));

  return (
    <div className="space-y-4 select-none">
      {/* Live HUD Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0D0F12] px-4 py-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-4 font-mono-num">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Финиш</span>
            <span className="font-bold text-white">{(timeLeftMs / 1000).toFixed(1)}с</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Монеты</span>
            <span className="font-bold text-[#FACC15]">{coins} (+{coins * 20})</span>
          </div>
          <div className="flex items-center gap-1" aria-label={`Броня ${hp} из 2`}>
            <span className="text-slate-400 mr-1">Броня</span>
            {[0, 1].map((idx) => (
              <Heart
                key={idx}
                className={`h-4 w-4 ${idx < hp ? 'fill-rose-500 text-rose-500' : 'text-slate-600'}`}
              />
            ))}
          </div>
        </div>
        <div className="text-xs font-mono-num text-slate-300">
          Попытки {energy.charges}/{energy.maxCharges}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {phase === 'TITLE_MENU' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-5 text-center space-y-4">
          <div className="mx-auto relative h-28 w-44 overflow-hidden rounded-xl border border-amber-400/25 bg-[#161920] flex items-center justify-center">
            {!imgBroken ? (
              <img
                src={TENET_CAR_IMG}
                alt="TENET T4"
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <Car className="h-10 w-10 text-[#FACC15]" />
            )}
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-extrabold text-white">Гонка на TENET T4</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Продержись 25 секунд по 3-полосной трассе! Собирай монеты (<span className="text-[#FACC15] font-semibold">+20 TC</span>), уворачивайся от ям (2 единицы брони) и получи <span className="text-emerald-300 font-semibold">+120 TC</span> за финиш. До <span className="font-mono-num text-white">500 TC</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={startRace}
            disabled={busy || (isAuthorized && energy.charges <= 0)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 transition-colors cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>
              {!isAuthorized
                ? 'Войти и сесть за руль'
                : energy.charges <= 0
                ? 'Нет попыток'
                : busy
                ? 'Заводим мотор...'
                : 'Старт заезда (25с)'}
            </span>
          </button>
        </div>
      )}

      {phase === 'PLAYING' && (
        <div className="space-y-3">
          <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-white/10 bg-[#090B0E]">
            <canvas
              ref={canvasRef}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                moveLane(clickX < rect.width / 2 ? -1 : 1);
              }}
              className="block w-full h-[270px] sm:h-[300px] cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            />
            <div className="pointer-events-none absolute top-2 right-3 text-[11px] font-mono-num font-semibold text-slate-300 bg-black/55 px-2 py-0.5 rounded">
              ~{estimatedPreview} TC
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-[440px] mx-auto">
            <button
              type="button"
              onClick={() => moveLane(-1)}
              style={{ touchAction: 'manipulation' }}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#181B22] hover:bg-[#222731] active:scale-95 text-sm font-display font-bold text-white cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Влево</span>
            </button>
            <button
              type="button"
              onClick={() => moveLane(1)}
              style={{ touchAction: 'manipulation' }}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#181B22] hover:bg-[#222731] active:scale-95 text-sm font-display font-bold text-white cursor-pointer"
            >
              <span>Вправо</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {phase === 'ROUND_SUMMARY' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-6 text-center space-y-4">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FACC15]/15 text-[#FACC15]">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-display font-bold">
              {didSurvive ? 'Финиш пройден!' : 'Столкновение! Частичная награда'}
            </p>
            <p className="font-mono-num text-3xl font-extrabold text-[#FACC15]">
              +{formatTC(finalReward ?? 0)} TC
            </p>
            <p className="text-xs text-slate-400 font-mono-num">
              Монет: {coins} · Дистанция: {distance} м · Рекорд: {formatTC(Math.max(energy.bestScore, finalReward ?? 0))} TC
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {energy.charges > 0 && (
              <button
                type="button"
                onClick={startRace}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#FACC15] px-5 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Ещё заезд ({energy.charges}/{energy.maxCharges})</span>
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

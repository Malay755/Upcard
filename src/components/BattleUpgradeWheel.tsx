import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ItemCard } from '../types';
import { soundFX } from '../utils/sound';
import { LegendaryRevealModal } from './LegendaryRevealModal';

interface Props {
  hostName: string;
  guestName: string;
  hostChance: number;
  rollValue: number;
  winnerName: string;
  won: boolean;
  startedAt: number;
  rewardItem?: ItemCard;
}

interface ConfettiParticle {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  rot: number; vRot: number; tilt: number; vTilt: number; color: string; life: number; decay: number;
}

const DURATION = 4200;
const ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

export const BattleUpgradeWheel: React.FC<Props> = ({ hostName, guestName, hostChance, rollValue, winnerName, won, startedAt, rewardItem }) => {
  const wheelRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const celebratedRef = useRef(false);
  const [lastOutcome, setLastOutcome] = useState(false);
  const [showLegendary, setShowLegendary] = useState(false);
  const radius = 112;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    celebratedRef.current = false;
    setLastOutcome(false);
    setShowLegendary(false);
    particlesRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener('resize', resize);
    let raf = 0;
    let lastFrame = performance.now();
    let lastBucket = 0;
    let pointerAngle = 0;
    let pointerVelocity = 0;
    const targetMod = ((360 - (rollValue / 100) * 360) % 360 + 360) % 360;
    const targetAngle = 360 * 6 + targetMod;
    const easedCurve = (t: number) => t >= 1 ? 1 : t < 0.05 ? 0.045 * (t / 0.05) ** 2 : 0.045 + 0.955 * (1 - (1 - (t - 0.05) / 0.95) ** 4.2);

    const burst = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const oy = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.4;
      const colors = ['#FACC15', '#FB923C', '#10B981', '#FEF08A', '#FFFFFF'];
      const count = rewardItem?.rarity === 'legendary' ? 140 : 85;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 180 + Math.random() * 520;
        particlesRef.current.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 180, w: 5 + Math.random() * 6, h: 3.5 + Math.random() * 5, rot: Math.random() * Math.PI * 2, vRot: (Math.random() - 0.5) * 14, tilt: Math.random() * Math.PI, vTilt: 6 + Math.random() * 8, color: colors[i % colors.length], life: 1, decay: 0.45 + Math.random() * 0.28 });
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      const elapsed = Math.max(0, Date.now() - startedAt);
      const progress = Math.min(1, elapsed / DURATION);
      const eased = easedCurve(progress);
      const angle = targetAngle * eased;
      wheelRef.current?.setAttribute('transform', `rotate(${angle.toFixed(2)} 150 150)`);
      const angularVelocity = (targetAngle * (easedCurve(Math.min(1, progress + 0.001)) - eased) / Math.max(0.001, dt)) * 0.001;
      const bucket = Math.floor(angle / 18);
      if (bucket !== lastBucket && progress < 0.985 && elapsed < DURATION) {
        lastBucket = bucket;
        soundFX.playRouletteTick(progress);
        pointerVelocity -= 140 + Math.min(1, Math.abs(angularVelocity) / 1200) * 240;
      }
      if (elapsed >= DURATION && elapsed < DURATION + 180 && !celebratedRef.current) {
        celebratedRef.current = true;
        setLastOutcome(true);
        if (won) {
          burst();
          if (rewardItem?.rarity === 'legendary') { soundFX.playItemDropSound('legendary'); void soundFX.playLegendaryRevealSound(); setShowLegendary(true); }
          else soundFX.playWin(rewardItem?.rarity ?? 'rare');
        } else soundFX.playLoss();
      }

      pointerVelocity += (-560 * pointerAngle - 17.5 * pointerVelocity) * dt;
      pointerAngle += pointerVelocity * dt;
      pointerRef.current?.style.setProperty('transform', `rotate(${pointerAngle.toFixed(2)}deg)`);

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const list = particlesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.vy += 860 * dt; p.vx *= Math.pow(0.985, dt * 60); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vRot * dt; p.tilt += p.vTilt * dt; p.life -= p.decay * dt;
          if (p.life <= 0 || p.y > window.innerHeight + 40) { list.splice(i, 1); continue; }
          ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.tilt)); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [startedAt, hostChance, rollValue, won, rewardItem]);

  const winArcLength = (hostChance / 100) * circumference;
  return <>
    {typeof document !== 'undefined' && createPortal(<canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full"/>, document.body)}
    <div className="flex flex-col items-center gap-4 rounded-xl bg-[#0D0F12] p-5">
      <div className="relative flex h-[300px] w-[300px] items-center justify-center" ref={boxRef}>
        {lastOutcome && <div className={`pointer-events-none absolute inset-1 rounded-full border-2 animate-wheel-pulse ${won ? 'border-emerald-400/75' : 'border-rose-500/60'}`}/>}
        <div className="pointer-events-none absolute -top-2.5 left-1/2 z-30 h-9 w-7 -translate-x-1/2 drop-shadow-[0_4px_8px_rgba(0,0,0,0.85)]">
          <svg ref={pointerRef} viewBox="0 0 60 80" className="h-full w-full will-change-transform" style={{ transformOrigin: '50% 20%' }}><path d="M30 74 L18 22 C16 12, 22 6, 30 6 C38 6, 44 12, 42 22 Z" fill="#FACC15" stroke="#0B0D10" strokeWidth="3"/></svg>
        </div>
        <svg viewBox="0 0 300 300" className="relative z-10 h-[294px] w-[294px]">
          <defs><linearGradient id="battleWinZoneGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FDE047"/><stop offset="55%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#EA580C"/></linearGradient><radialGradient id="battleWheelGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#16181E"/><stop offset="100%" stopColor="#0E1014"/></radialGradient></defs>
          <circle cx="150" cy="150" r="138" fill="#0E1014" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5"/>
          <g ref={wheelRef} transform="rotate(0 150 150)"><circle cx="150" cy="150" r={radius} fill="none" stroke="#1A1D24" strokeWidth="22"/><circle cx="150" cy="150" r={radius} fill="none" stroke="url(#battleWinZoneGrad)" strokeWidth="22" strokeDasharray={`${winArcLength} ${circumference}`} transform="rotate(-90 150 150)"/>{ANGLES.map((deg) => <line key={deg} x1="150" y1="24" x2="150" y2="54" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" transform={`rotate(${deg} 150 150)`}/>)}</g>
          <circle cx="150" cy="150" r="95" fill="url(#battleWheelGlow)" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2"/><circle cx="150" cy="150" r="72" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
        </svg>
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-10 text-center"><svg viewBox="0 0 64 58" className="h-14 w-16" aria-hidden="true"><path d="M32 8L10 28L16.5 34.5L32 20L47.5 34.5L54 28L32 8Z" fill="#FACC15"/><path d="M32 25L10 45L16.5 51.5L32 37L47.5 51.5L54 45L32 25Z" fill="#A16207" opacity=".65"/></svg><span className="mt-1 text-sm font-mono-num font-bold text-[#FACC15]">{hostChance.toFixed(2)}%</span><span className={`mt-1 text-xs font-bold ${won ? 'text-emerald-400' : 'text-rose-400'}`}>{won ? `Победа · ${rollValue.toFixed(2)}` : `Соперник · ${rollValue.toFixed(2)}`}</span></div>
      </div>
      <div className="flex w-full max-w-md justify-between gap-3 text-xs"><span className="text-amber-200">{hostName} · {hostChance.toFixed(2)}%</span><span className="text-right text-violet-300">{guestName} · {(100-hostChance).toFixed(2)}%</span></div>
      <div className="text-xs text-slate-400">{won ? 'Ставки переданы победителю' : `Победитель: ${winnerName}`}</div>
    </div>
    <LegendaryRevealModal item={showLegendary && won && rewardItem?.rarity === 'legendary' ? rewardItem : null} sourceLabel="Победа в батле апгрейдов" onClose={() => setShowLegendary(false)}/>
  </>;
};

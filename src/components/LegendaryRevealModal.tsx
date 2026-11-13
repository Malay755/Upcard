import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Sparkles } from 'lucide-react';
import type { ItemCard } from '../types';
import { formatTC } from '../utils/economics';
import { CardFrame } from './CardFrame';

interface LegendaryRevealModalProps {
  item: ItemCard | null;
  sourceLabel: string;
  onClose: () => void;
  onSell?: () => Promise<void>;
}

const SPIN_DURATION_MS = 2900;
const TOTAL_SPINS_DEG = 6 * 360; // 6 full continuous 360deg rotations landing smoothly at front

export const LegendaryRevealModal: React.FC<LegendaryRevealModalProps> = ({
  item,
  sourceLabel,
  onClose,
  onSell,
}) => {
  const card3dRef = useRef<HTMLDivElement | null>(null);
  const shineRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!item) return;

    const el = card3dRef.current;
    const shineEl = shineRef.current;
    const actionsEl = actionsRef.current;
    if (!el) return;

    let rafId = 0;
    const startTime = performance.now();
    let shineTriggered = false;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / SPIN_DURATION_MS);

      // Single C-infinity smooth quartic deceleration curve:
      // ultra-fast continuous 360° spinning at the beginning, smoothly slowing to exact front-facing rest
      const easedSpin = 1 - Math.pow(1 - progress, 4.4);
      const angleY = TOTAL_SPINS_DEG * easedSpin;

      const easedScale = 0.52 + 0.48 * (1 - Math.pow(1 - progress, 3.2));
      const tiltX = 14 * Math.pow(1 - progress, 2.4);
      const opacity = Math.min(1, progress * 5.5);

      el.style.opacity = String(opacity);
      el.style.transform = `scale3d(${easedScale}, ${easedScale}, 1) rotateX(${tiltX.toFixed(2)}deg) rotateY(${angleY.toFixed(2)}deg)`;

      if (progress >= 0.72 && !shineTriggered) {
        shineTriggered = true;
        if (shineEl) {
          shineEl.classList.add('animate-legendary-shine');
        }
        if (actionsEl) {
          actionsEl.style.opacity = '1';
          actionsEl.style.transform = 'translateY(0)';
        }
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Snap cleanly to 0deg mod 360deg front-facing
        el.style.opacity = '1';
        el.style.transform = `scale3d(1, 1, 1) rotateX(0deg) rotateY(${TOTAL_SPINS_DEG}deg)`;
      }
    };

    if (actionsEl) {
      actionsEl.style.opacity = '0';
      actionsEl.style.transform = 'translateY(14px)';
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [item]);

  if (!item || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4 overflow-hidden animate-legendary-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Легендарная находка: ${item.name}`}
    >
      {/* Rotating Golden Radial Light Rays */}
      <div
        className="absolute w-[700px] h-[700px] rounded-full pointer-events-none animate-legendary-rays"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(250, 204, 21, 0.17) 0deg 10deg, transparent 10deg 26deg)',
          maskImage: 'radial-gradient(circle, black 10%, transparent 68%)',
          WebkitMaskImage: 'radial-gradient(circle, black 10%, transparent 68%)',
        }}
      />

      {/* Warm Central Glow */}
      <div className="absolute w-96 h-96 rounded-full bg-amber-400/25 blur-3xl pointer-events-none animate-legendary-glow" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full space-y-6 animate-modal-panel">
        {/* Title Fade In */}
        <div className="space-y-1 animate-legendary-title">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.18em] uppercase text-[#FACC15]">
            <Sparkles className="w-4 h-4" />
            <span>Легендарное выпадение</span>
          </div>
          <p className="text-xs text-slate-400">{sourceLabel}</p>
        </div>

        {/* Smooth 60-120fps Continuous 3D Double-Sided Card Stage */}
        <div className="perspective-stage">
          <div
            ref={card3dRef}
            data-testid="legendary-3d-card"
            className="relative preserve-3d will-change-transform"
            style={{ opacity: 0, transform: 'scale3d(0.52, 0.52, 1) rotateX(14deg) rotateY(0deg)' }}
          >
            {/* Front Face */}
            <div className="relative backface-hidden overflow-hidden rounded-2xl">
              <CardFrame item={item} size="lg" showPrice={false} />
              <div
                ref={shineRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 opacity-0 bg-gradient-to-r from-transparent via-amber-200/45 to-transparent"
              />
            </div>

            {/* Back Face: Embossed Golden Shield Reverse */}
            <div
              aria-hidden="true"
              className="absolute inset-0 backface-hidden flex items-center justify-center"
              style={{ transform: 'rotateY(180deg)' }}
            >
              <div className="w-64 aspect-[3/4]">
                <svg viewBox="0 0 300 400" className="w-full h-full drop-shadow-[0_10px_25px_rgba(250,204,21,0.35)]">
                  <defs>
                    <linearGradient id="legBackGold" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFF3B0" />
                      <stop offset="40%" stopColor="#E5A93B" />
                      <stop offset="80%" stopColor="#8B5A12" />
                      <stop offset="100%" stopColor="#FDE047" />
                    </linearGradient>
                    <linearGradient id="legBackCore" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1B1033" />
                      <stop offset="55%" stopColor="#2D1652" />
                      <stop offset="100%" stopColor="#140B24" />
                    </linearGradient>
                  </defs>

                  <path
                    d="M 150 14 C 178 36, 224 44, 266 36 L 278 58 L 272 288 C 272 332, 224 366, 150 388 C 76 366, 28 332, 28 288 L 22 58 L 34 36 C 76 44, 122 36, 150 14 Z"
                    fill="url(#legBackGold)"
                    stroke="#4A2C04"
                    strokeWidth="3"
                  />
                  <path
                    d="M 150 34 C 174 52, 214 60, 250 54 L 258 68 L 252 284 C 252 320, 212 348, 150 368 C 88 348, 48 320, 48 284 L 42 68 L 50 54 C 86 60, 126 52, 150 34 Z"
                    fill="url(#legBackCore)"
                    stroke="#FFF3B0"
                    strokeWidth="2"
                  />

                  <polygon
                    points="150,115 215,200 150,285 85,200"
                    fill="none"
                    stroke="url(#legBackGold)"
                    strokeWidth="2.5"
                    opacity="0.85"
                  />
                  <polygon
                    points="150,136 196,200 150,264 104,200"
                    fill="rgba(250,204,21,0.08)"
                    stroke="#FDE047"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M150 164L122 192L130 200L150 180L170 200L178 192L150 164Z"
                    fill="#FACC15"
                  />
                  <path
                    d="M150 186L122 214L130 222L150 202L170 222L178 214L150 186Z"
                    fill="#FACC15"
                    opacity="0.65"
                  />
                  <text
                    x="150"
                    y="244"
                    textAnchor="middle"
                    fill="#FEF08A"
                    fontSize="14"
                    fontWeight="800"
                    letterSpacing="3"
                  >
                    CARDUP
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Name, Price & Action Buttons */}
        <div
          ref={actionsRef}
          className="w-full space-y-4 transition-all duration-500 ease-out"
          style={{ opacity: 0, transform: 'translateY(14px)' }}
        >
          <div>
            <h2 className="text-2xl font-display font-extrabold text-white">{item.name}</h2>
            <div className="text-lg font-mono-num font-bold text-[#FACC15] mt-0.5">
              {formatTC(item.price)} TC
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {onSell && (
              <button
                type="button"
                onClick={onSell}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#181B20] hover:bg-[#20242B] border border-white/15 text-emerald-400 font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Coins className="w-4 h-4" />
                <span>Продать за {formatTC(item.price)} TC</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-8 py-3 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-sm transition-colors cursor-pointer"
            >
              Забрать в инвентарь
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

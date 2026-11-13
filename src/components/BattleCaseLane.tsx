import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CaseBox, ItemCard } from '../types';
import { formatTC } from '../utils/economics';
import { soundFX } from '../utils/sound';
import { CardFrame } from './CardFrame';
import { CaseStage3D } from './CaseStage3D';

const SLOT_WIDTH = 144;
const LID_MS = 1500;
const REEL_MS = 3900;
const ROUND_MS = LID_MS + REEL_MS;
const WIN_INDEX = 34;

interface Props {
  playerName: string;
  caseBox: CaseBox;
  pool: ItemCard[];
  drop: ItemCard;
  roundIndex: number;
  startedAt: number;
}

export const BATTLE_CASE_ROUND_MS = ROUND_MS;

export const BattleCaseLane: React.FC<Props> = ({ playerName, caseBox, pool, drop, roundIndex, startedAt }) => {
  const [phase, setPhase] = useState<'waiting' | 'lid' | 'reel' | 'done'>('waiting');
  const tapeRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const playedRoundRef = useRef(-1);
  const roundStart = startedAt + roundIndex * ROUND_MS;
  const tape = useMemo(() => {
    const generated: ItemCard[] = [];
    for (let i = 0; i < 44; i++) generated.push(i === WIN_INDEX ? drop : pool[Math.floor(Math.random() * Math.max(1, pool.length))] ?? drop);
    return generated;
  }, [roundIndex, drop.id, pool]);

  useEffect(() => {
    reelRef.current?.style.setProperty('transform', 'translate3d(0,0,0)');
    progressRef.current?.style.setProperty('transform', 'scaleX(0)');
    const tapeStart = roundStart + LID_MS;
    setPhase(Date.now() < roundStart ? 'waiting' : Date.now() < tapeStart ? 'lid' : 'reel');
    let previousSlot = -1;
    let raf = 0;
    let lidTimer = 0;
    let reelTimer = 0;
    const animate = () => {
      const containerWidth = tapeRef.current?.clientWidth ?? 520;
      const targetOffset = WIN_INDEX * SLOT_WIDTH + SLOT_WIDTH / 2 - containerWidth / 2;
      const elapsed = Math.max(0, Date.now() - tapeStart);
      const progress = Math.min(1, elapsed / REEL_MS);
      const eased = 1 - Math.pow(1 - progress, 4.2);
      const nextOffset = targetOffset * eased;
      reelRef.current?.style.setProperty('transform', `translate3d(-${nextOffset}px,0,0)`);
      progressRef.current?.style.setProperty('transform', `scaleX(${progress})`);
      if (previousSlot < 0) previousSlot = Math.floor(containerWidth / 2 / SLOT_WIDTH);
      const slot = Math.floor((nextOffset + containerWidth / 2) / SLOT_WIDTH);
      if (slot !== previousSlot && progress < 1) { previousSlot = slot; soundFX.playCaseTick(progress); }
      if (progress < 1) raf = window.requestAnimationFrame(animate);
      else if (playedRoundRef.current !== roundIndex) {
        playedRoundRef.current = roundIndex;
        setPhase('done');
        soundFX.playItemDropSound(drop.rarity);
        if (drop.rarity === 'legendary') void soundFX.playLegendaryRevealSound();
      }
    };
    const beginLid = () => {
      setPhase('lid');
      const waitForTape = Math.max(0, tapeStart - Date.now());
      reelTimer = window.setTimeout(() => { setPhase('reel'); raf = window.requestAnimationFrame(animate); }, waitForTape);
    };
    const waitForStart = Math.max(0, roundStart - Date.now());
    if (waitForStart > 0) lidTimer = window.setTimeout(beginLid, waitForStart);
    else if (Date.now() < tapeStart) {
      setPhase('lid');
      reelTimer = window.setTimeout(() => { setPhase('reel'); raf = window.requestAnimationFrame(animate); }, Math.max(0, tapeStart - Date.now()));
    } else {
      const containerWidth = tapeRef.current?.clientWidth ?? 520;
      const targetOffset = WIN_INDEX * SLOT_WIDTH + SLOT_WIDTH / 2 - containerWidth / 2;
      reelRef.current?.style.setProperty('transform', `translate3d(-${targetOffset}px,0,0)`);
      progressRef.current?.style.setProperty('transform', 'scaleX(1)');
      setPhase('done');
      if (playedRoundRef.current !== roundIndex) playedRoundRef.current = roundIndex;
    }
    return () => { window.clearTimeout(lidTimer); window.clearTimeout(reelTimer); cancelAnimationFrame(raf); };
  }, [roundIndex, roundStart, drop.id, drop.rarity, tape.length]);

  const isLidOpening = phase === 'lid';
  const isReeling = phase === 'reel';
  const complete = phase === 'done';
  const rarityGlow = drop.rarity === 'legendary' ? 'border-amber-300/50 shadow-amber-300/20' : drop.rarity === 'epic' ? 'border-purple-300/40 shadow-purple-400/15' : 'border-emerald-300/25 shadow-emerald-300/10';

  return <section className="min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0D0F12]">
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2"><span className="truncate text-sm font-bold text-white">{playerName}</span><span className="shrink-0 text-[11px] text-slate-400">Раунд {roundIndex + 1}</span></div>
    <div className="relative h-[310px] overflow-hidden sm:h-[350px]">
      <div className={`absolute inset-0 transition-opacity duration-300 ${isReeling || complete ? 'opacity-0' : 'opacity-100'}`}>
        <CaseStage3D caseBox={caseBox} isOpeningLid={isLidOpening} entryKey={0}/>
      </div>
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 transition-opacity duration-300 ${isReeling || complete ? 'opacity-100' : 'opacity-0'}`}>
        <div ref={tapeRef} className="relative mx-auto flex h-52 w-full items-center overflow-hidden border-y border-white/[0.08] bg-black/45 shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-[#0B0D10] to-transparent"/>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-[#0B0D10] to-transparent"/>
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-[3px] -translate-x-1/2 bg-[#FACC15] shadow-[0_0_14px_rgba(250,204,21,0.9)]"/>
          <div ref={reelRef} className="flex h-full items-center will-change-transform">
            {tape.map((item, index) => <div key={`${roundIndex}-${index}-${item.id}`} className="flex h-full shrink-0 items-center justify-center" style={{ width: SLOT_WIDTH }}><CardFrame item={item} size="sm" showPrice={false}/></div>)}
          </div>
        </div>
      </div>
      {complete && <div className={`absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-xl border bg-[#111318]/95 p-2.5 shadow-xl animate-banner-in ${rarityGlow}`}><CardFrame item={drop} size="xs" showPrice={false}/><div className="min-w-0"><div className="truncate text-xs font-bold text-white">{drop.name}</div><div className="text-[11px] text-slate-400">Выпало · {formatTC(drop.price)} TC</div></div></div>}
      {isReeling && <div className="absolute bottom-2 left-3 right-3 h-1 overflow-hidden rounded-full bg-white/10"><div ref={progressRef} className="h-full origin-left scale-x-0 bg-amber-300 transition-none"/></div>}
    </div>
  </section>;
};

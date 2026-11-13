import React from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X } from 'lucide-react';
import { formatTC } from '../utils/economics';

interface Player {
  username: string;
  avatarUrl?: string;
  avatarColor?: string;
  netProfit?: number;
}

interface Props {
  winner: Player | null;
  host: Player;
  guest: Player;
  isViewerWinner: boolean;
  isDraw: boolean;
  caseBattle: boolean;
  prizeValue?: number;
  onClose: () => void;
}

const CONFETTI_COLORS = ['#FACC15', '#FB923C', '#E2E8F0', '#F59E0B', '#94A3B8'];

export const BattleWinnerOverlay: React.FC<Props> = ({ winner, host, guest, isViewerWinner, isDraw, caseBattle, prizeValue, onClose }) => {
  if (typeof document === 'undefined') return null;
  const confetti = Array.from({ length: 46 }, (_, index) => ({
    left: `${(index * 43 + 7) % 100}%`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    delay: `${(index % 13) * -0.19}s`,
    duration: `${2.5 + (index % 7) * 0.22}s`,
    drift: `${((index * 29) % 150) - 75}px`,
    turn: `${360 + (index % 4) * 360}deg`,
  }));
  const avatar = (player: Player, size: string) => player.avatarUrl
    ? <img src={player.avatarUrl} alt="" className={`${size} rounded-full border-2 border-amber-200/60 object-cover shadow-[0_0_35px_rgba(250,204,21,0.25)]`} />
    : <span className={`${size} inline-flex items-center justify-center rounded-full border-2 border-amber-200/50 text-lg font-black text-slate-950`} style={{ backgroundColor: player.avatarColor || '#FACC15' }}>{player.username.slice(0, 2).toUpperCase()}</span>;

  return createPortal(<div className="winner-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={isDraw ? 'Ничья в батле' : `Победитель батла: ${winner?.username}`}>
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">{confetti.map((piece, index) => <i key={index} className="winner-confetti-piece" style={{ left: piece.left, backgroundColor: piece.color, '--confetti-delay': piece.delay, '--confetti-time': piece.duration, '--confetti-drift': piece.drift, '--confetti-turn': piece.turn } as React.CSSProperties}/>)}</div>
    <div className="winner-panel relative z-10 w-full max-w-xl rounded-3xl border border-amber-200/25 bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.12),transparent_55%),#121419] p-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.75)] sm:p-9">
      <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:text-white"><X className="h-4 w-4"/></button>
      <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-4 py-2 text-xs font-black tracking-[0.2em] text-amber-200"><Trophy className="h-4 w-4"/>{isDraw ? 'НИЧЬЯ' : 'БАТТЛ ЗАВЕРШЁН'}</div>
      {isDraw ? <>
        <h2 className="text-3xl font-black text-white sm:text-4xl">Равный результат</h2>
        <p className="mt-2 text-sm text-slate-400">Каждый игрок сохранил свои выпадения.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">{[host, guest].map((player) => <div key={player.username} className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-black/20 p-4">{avatar(player, 'h-16 w-16')}<span className="max-w-full truncate text-sm font-bold text-white">{player.username}</span>{caseBattle && typeof player.netProfit === 'number' && <span className={player.netProfit >= 0 ? 'text-sm font-bold text-amber-200' : 'text-sm font-bold text-slate-400'}>Прибыль {player.netProfit >= 0 ? '+' : ''}{formatTC(player.netProfit)} TC</span>}</div>)}</div>
      </> : winner ? <>
        <div className="mx-auto flex w-fit items-center justify-center rounded-full bg-amber-300/[0.08] p-3">{avatar(winner, 'h-28 w-28 sm:h-36 sm:w-36')}</div>
        <div className="mt-4 text-[11px] font-black uppercase tracking-[0.3em] text-amber-300">{isViewerWinner ? 'Твоя победа' : 'Победитель'}</div>
        <h2 className="mt-1 break-words text-4xl font-black text-white drop-shadow-[0_0_24px_rgba(250,204,21,0.28)] sm:text-5xl">{winner.username}</h2>
        {caseBattle && typeof winner.netProfit === 'number' && <p className="mt-3 text-sm text-slate-300">Чистая прибыль: <b className={winner.netProfit >= 0 ? 'text-amber-200' : 'text-slate-300'}>{winner.netProfit >= 0 ? '+' : ''}{formatTC(winner.netProfit)} TC</b></p>}
        {!caseBattle && prizeValue !== undefined && <p className="mt-3 text-sm text-slate-300">Общая стоимость выигранных карточек: <b className="text-amber-200">{formatTC(prizeValue)} TC</b></p>}
      </> : null}
      <button type="button" onClick={onClose} className="mt-7 w-full rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition-transform hover:scale-[1.02]">Продолжить</button>
    </div>
  </div>, document.body);
};

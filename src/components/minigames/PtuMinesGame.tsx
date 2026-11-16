import React, { useState } from 'react';
import { Bomb, Check, Coins, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import type { MinesBoardState, MinigameEnergySlot } from '../../types';
import { formatTC } from '../../utils/economics';
import { soundFX } from '../../utils/sound';

interface PtuMinesGameProps {
  energy: MinigameEnergySlot;
  isAuthorized: boolean;
  onRequireAuth: () => void;
  onStart: () => Promise<MinesBoardState>;
  onStep: (sessionId: string, cellIndex: number) => Promise<{ board: MinesBoardState; stepBonus?: number; reward: number }>;
  onCashout: (sessionId: string) => Promise<{ board: MinesBoardState; reward: number }>;
  onBack: () => void;
}

const TRAP_ART = '/assets/cards/drunk_artemiy.png';

export const PtuMinesGame: React.FC<PtuMinesGameProps> = ({
  energy,
  isAuthorized,
  onRequireAuth,
  onStart,
  onStep,
  onCashout,
  onBack,
}) => {
  const [board, setBoard] = useState<MinesBoardState | null>(null);
  const [busyCell, setBusyCell] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCashout, setLastCashout] = useState<number | null>(null);
  const [trapImgBroken, setTrapImgBroken] = useState(false);

  const handleStart = async () => {
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    if (busyAction) return;
    setErrorMsg('');
    setLastCashout(null);
    setBusyAction(true);
    try {
      const nextBoard = await onStart();
      setBoard(nextBoard);
      soundFX.playWheelStart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось начать раунд.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStep = async (cellIndex: number) => {
    if (!board || board.status !== 'playing' || busyCell !== null || busyAction) return;
    if (board.revealedSafe.includes(cellIndex)) return;
    setErrorMsg('');
    setBusyCell(cellIndex);
    try {
      const res = await onStep(board.sessionId, cellIndex);
      setBoard(res.board);
      if (res.board.status === 'busted') {
        soundFX.playMiniTrap();
      } else if (res.board.status === 'cashed_out') {
        setLastCashout(res.reward);
        soundFX.playWheelWinFanfare(true);
      } else {
        soundFX.playMiniTap(res.board.revealedSafe.length);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка хода.');
    } finally {
      setBusyCell(null);
    }
  };

  const handleCashout = async () => {
    if (!board || board.status !== 'playing' || board.currentBank <= 0 || busyAction || busyCell !== null) return;
    setErrorMsg('');
    setBusyAction(true);
    try {
      const res = await onCashout(board.sessionId);
      setBoard(res.board);
      setLastCashout(res.reward);
      soundFX.playWheelWinFanfare(res.reward >= 350);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось забрать банк.');
    } finally {
      setBusyAction(false);
    }
  };

  const isPlaying = board?.status === 'playing';
  const isFinished = board && (board.status === 'busted' || board.status === 'cashed_out');
  const maxSafe = (board?.gridSize ?? 16) - (board?.minesCount ?? 3);

  return (
    <div className="space-y-4 select-none">
      {/* Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0D0F12] px-4 py-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-4 font-mono-num">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Открыто</span>
            <span className="font-bold text-white">
              {board ? `${board.revealedSafe.length}/${maxSafe}` : `0/${maxSafe}`}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Банк</span>
            <span className="font-bold text-[#FACC15]">
              {formatTC(board?.status === 'cashed_out' ? (lastCashout ?? board.currentBank) : (board?.currentBank ?? 0))} TC
            </span>
          </div>
          {isPlaying && (
            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">След. шаг</span>
              <span className="font-bold text-emerald-400">+{board.nextStepBonus} TC</span>
            </div>
          )}
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

      {!board && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-5 text-center space-y-4">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-[#FACC15]">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-extrabold text-white">Минное поле ПТУ</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              На поле 4×4 спрятаны <span className="text-rose-400 font-semibold">3 ловушки ПТУ</span>. Вход бесплатный — каждый верный шаг увеличивает банк, и ты можешь забрать TC в любой момент или рискнуть ради <span className="font-mono-num text-[#FACC15]">1 100 TC</span> за полную зачистку.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStart}
            disabled={busyAction || (isAuthorized && energy.charges <= 0)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 transition-colors cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>
              {!isAuthorized
                ? 'Войти и открыть поле'
                : energy.charges <= 0
                ? 'Нет попыток'
                : busyAction
                ? 'Генерируем поле...'
                : 'Начать вылазку'}
            </span>
          </button>
        </div>
      )}

      {board && (
        <>
          <div className="grid grid-cols-4 gap-2 sm:gap-2.5 rounded-xl border border-white/[0.07] bg-[#0D0F12] p-3 sm:p-4 max-w-[420px] mx-auto">
            {Array.from({ length: board.gridSize }, (_, idx) => {
              const isSafeRevealed = board.revealedSafe.includes(idx);
              const isMine = board.mineLocations?.includes(idx) ?? false;
              const isLoading = busyCell === idx;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!isPlaying || isSafeRevealed || busyCell !== null || busyAction}
                  onClick={() => handleStep(idx)}
                  style={{ touchAction: 'manipulation' }}
                  aria-label={
                    isMine
                      ? `Ловушка ПТУ ${idx + 1}`
                      : isSafeRevealed
                      ? `Безопасная клетка ${idx + 1}`
                      : `Закрытая клетка ${idx + 1}`
                  }
                  className={`relative min-h-[64px] sm:min-h-[74px] rounded-xl border flex flex-col items-center justify-center transition-all active:scale-95 ${
                    isMine
                      ? 'border-rose-500 bg-rose-950/60 shadow-[0_0_16px_rgba(244,63,94,0.28)]'
                      : isSafeRevealed
                      ? 'border-emerald-400/55 bg-emerald-950/35 text-emerald-300'
                      : isPlaying
                      ? 'border-white/[0.1] bg-[#181B22] hover:border-[#FACC15]/50 hover:bg-[#1F232C] cursor-pointer'
                      : 'border-white/[0.06] bg-[#14161A] opacity-65'
                  }`}
                >
                  {isMine ? (
                    <div className="flex flex-col items-center gap-0.5">
                      {!trapImgBroken ? (
                        <img
                          src={TRAP_ART}
                          alt="Ловушка БУМ"
                          referrerPolicy="no-referrer"
                          onError={() => setTrapImgBroken(true)}
                          className="h-8 w-8 rounded-lg object-cover border border-rose-400/70"
                        />
                      ) : (
                        <Bomb className="h-5 w-5 text-rose-400" />
                      )}
                      <span className="text-[10px] font-display font-extrabold text-rose-300 leading-none">
                        БУМ
                      </span>
                    </div>
                  ) : isSafeRevealed ? (
                    <div className="flex flex-col items-center gap-1">
                      <Check className="h-5 w-5 text-emerald-400" />
                      <span className="text-[10px] font-mono-num font-bold text-[#FACC15]">+TC</span>
                    </div>
                  ) : isLoading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-[#FACC15] border-t-transparent animate-spin" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {isPlaying && (
              <button
                type="button"
                onClick={handleCashout}
                disabled={board.currentBank <= 0 || busyAction || busyCell !== null}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 transition-colors cursor-pointer"
              >
                <Coins className="h-4 w-4" />
                <span>
                  {board.currentBank > 0
                    ? `Забрать ${formatTC(board.currentBank)} TC`
                    : 'Открой безопасную клетку'}
                </span>
              </button>
            )}

            {isFinished && (
              <div className="w-full rounded-xl border border-white/[0.07] bg-[#0D0F12] p-4 text-center space-y-3">
                <p className="text-sm font-display font-bold text-white">
                  {board.status === 'busted'
                    ? 'Подрыв на ловушке ПТУ! Банк сгорел.'
                    : `Успешный выход! Забрано +${formatTC(lastCashout ?? 0)} TC`}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {energy.charges > 0 && (
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={busyAction}
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
        </>
      )}
    </div>
  );
};

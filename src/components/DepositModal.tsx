import React from 'react';
import { Coins, X } from 'lucide-react';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (amount: number, method: string, promoCode: string) => Promise<unknown>;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#14161A] shadow-2xl animate-modal-panel">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <h2 id="deposit-modal-title" className="text-lg font-display font-bold text-white">
            Пополнение баланса
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6 text-center">
          <Coins className="mx-auto h-10 w-10 text-amber-300" />
          <p className="text-sm leading-relaxed text-slate-300">
            Пополнение пока недоступно: платёжный провайдер не подключён. Выбор способа оплаты не создаёт платёж и не зачисляет монеты.
          </p>
          <p className="text-xs text-slate-500">
            Т-коины можно получать за ежедневный бонус и внутриигровые активности.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full cursor-pointer rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300"
          >
            Вернуться к игре
          </button>
        </div>
      </div>
    </div>
  );
};

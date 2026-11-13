import React from 'react';

export const LoadingOverlay: React.FC<{ label?: string; compact?: boolean }> = ({ label = 'Загружаем раздел', compact = false }) => (
  <div role="status" aria-live="polite" className={`${compact ? 'min-h-[240px]' : 'fixed inset-0 z-[80]'} flex flex-col items-center justify-center gap-3 overflow-hidden bg-[#090a0d]/95 p-6 text-center`}>
    <img
      src="/assets/battle-goat-loader.gif"
      alt=""
      aria-hidden="true"
      className="loading-goat-animation h-40 w-60 object-contain sm:h-52 sm:w-[320px]"
      style={{ filter: 'brightness(0) invert(0.82) sepia(0.25) saturate(1.2)' }}
    />
    <span className="text-sm font-semibold text-slate-200">{label}</span>
    <span className="loading-dots text-xs tracking-[0.35em] text-amber-300" aria-hidden="true">•••</span>
  </div>
);

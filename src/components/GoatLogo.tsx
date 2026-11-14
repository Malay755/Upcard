import React from 'react';

export const GoatLogo: React.FC<{ className?: string }> = ({ className = 'h-8 w-8' }) => (
  <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Логотип Ферма" fill="none">
    <path d="M18 25 9 10l17 8m20 7 9-15-17 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 25c0-8 7-13 16-13s16 5 16 13v14c0 10-7 17-16 17s-16-7-16-17V25Z" fill="currentColor"/>
    <path d="M22 31c2-2 5-2 7 0m6 0c2-2 5-2 7 0" stroke="#15171B" strokeWidth="3" strokeLinecap="round"/>
    <path d="M27 41c3-2 7-2 10 0l-5 7-5-7Z" fill="#15171B"/>
    <path d="M24 54 21 61m19-7 3 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
  </svg>
);

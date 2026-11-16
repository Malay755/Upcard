import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}

/** Reveals content once when at least 18% of it enters the viewport. */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  delayMs = 0,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setVisible(true);
    }, 350);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        window.clearTimeout(fallbackTimer);
        observer.unobserve(entry.target);
      },
      { threshold: 0.02, rootMargin: '80px 0px' },
    );

    observer.observe(element);
    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${Math.min(delayMs, 350)}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
};

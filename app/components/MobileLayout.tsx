'use client';
import { useState, useEffect } from 'react';
import type { Breakpoint } from '@/types';

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');

  useEffect(() => {
    const getBreakpoint = (): Breakpoint => {
      const w = window.innerWidth;
      if (w < 641) return 'mobile';
      if (w <= 1024) return 'tablet';
      return 'desktop';
    };

    setBreakpoint(getBreakpoint());

    const observer = new ResizeObserver(() => setBreakpoint(getBreakpoint()));
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  return breakpoint;
}

interface Props {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: Props) {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'mobile' && typeof window !== 'undefined' && window.innerWidth < 320) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-dv-bg z-50 p-6 text-center">
        <p className="text-sm text-dv-muted">
          Please rotate your device or use a wider screen for the best experience.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

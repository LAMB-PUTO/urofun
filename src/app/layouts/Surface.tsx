import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';

export type SurfaceKind = 'kiosk' | 'staff';

/**
 * Fija la superficie en <html> (para que cambie la raíz rem) y en el contenedor.
 */
export const Surface = ({ kind, className, children }: { kind: SurfaceKind; className?: string; children: ReactNode }) => {
  useLayoutEffect(() => {
    const prev = document.documentElement.getAttribute('data-surface');
    document.documentElement.setAttribute('data-surface', kind);
    return () => {
      if (prev) document.documentElement.setAttribute('data-surface', prev);
      else document.documentElement.removeAttribute('data-surface');
    };
  }, [kind]);
  return (
    <div data-surface={kind} className={className}>
      {children}
    </div>
  );
};

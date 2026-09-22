import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { initials } from '../../domain/types';

export const EmptyState = ({ icon, title, text, action }: { icon: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) => (
  <div className="empty">
    <div className="empty__icon">{icon}</div>
    <h3 className="h3">{title}</h3>
    {text && <p className="muted">{text}</p>}
    {action}
  </div>
);

export const Skeleton = ({ lines = 3, delayed = true }: { lines?: number; delayed?: boolean }) => (
  <div className={['skeleton-stack', delayed ? 'skeleton--delayed' : 'skeleton'].join(' ')} aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => (
      <span key={i} className="skeleton skeleton--line" style={{ width: `${[92, 78, 85, 70][i % 4]}%` }} />
    ))}
  </div>
);

export const SkeletonRows = ({ rows = 4 }: { rows?: number }) => (
  <div className="skeleton-stack skeleton--delayed" aria-hidden="true">
    {Array.from({ length: rows }, (_, i) => (
      <span key={i} className="skeleton skeleton--row" />
    ))}
  </div>
);

export const Avatar = ({ name, size, doctor }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; doctor?: boolean }) => (
  <span className={['avatar', size && size !== 'md' ? `avatar--${size}` : '', doctor ? 'avatar--doctor' : ''].filter(Boolean).join(' ')} aria-hidden="true">
    {initials(name) || '·'}
  </span>
);

export const Spinner = ({ size = 18 }: { size?: number }) => <Loader2 size={size} className="spin" aria-hidden="true" />;

interface SegmentedProps<V extends string> {
  options: Array<{ value: V; label: ReactNode; icon?: ReactNode }>;
  value: V;
  onChange: (v: V) => void;
  block?: boolean;
  name?: string;
  ariaLabel?: string;
}

export function Segmented<V extends string>({ options, value, onChange, block, name, ariaLabel }: SegmentedProps<V>) {
  const groupName = name ?? `seg-${Math.random().toString(36).slice(2)}`;
  return (
    <div className={['segmented', block ? 'segmented--block' : ''].filter(Boolean).join(' ')} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <label key={o.value} className="segmented__option">
          <input type="radio" name={groupName} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.icon}
          {o.label}
        </label>
      ))}
    </div>
  );
}

export const Callout = ({ tone = 'info', title, children, icon }: { tone?: 'alert' | 'info' | 'warning' | 'neutral'; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) => (
  <div className={`callout callout--${tone}`} role={tone === 'alert' ? 'alert' : undefined}>
    <span className="callout__icon">{icon ?? (tone === 'alert' || tone === 'warning' ? <AlertTriangle size={20} /> : <Info size={20} />)}</span>
    <div className="grow">
      {title && <div className="callout__title">{title}</div>}
      {children}
    </div>
  </div>
);

/** Menú desplegable simple (kebab). */
export const Menu = ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

export const MenuItem = ({ onClick, danger, icon, children }: { onClick: () => void; danger?: boolean; icon?: ReactNode; children: ReactNode }) => (
  <button type="button" role="menuitem" className={['menu__item', danger ? 'menu__item--danger' : ''].filter(Boolean).join(' ')} onClick={onClick}>
    {icon}
    {children}
  </button>
);

export const Tabs = <V extends string>({ tabs, value, onChange }: { tabs: Array<{ value: V; label: ReactNode; badge?: ReactNode }>; value: V; onChange: (v: V) => void }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={['tabs__tab', value === t.value ? 'is-active' : ''].filter(Boolean).join(' ')} onClick={() => onChange(t.value)}>
        {t.label}
        {t.badge}
      </button>
    ))}
  </div>
);

export const DataList = ({ items, cols }: { items: Array<[ReactNode, ReactNode]>; cols?: 2 }) => (
  <dl className={['dl', cols === 2 ? 'dl--2col' : ''].filter(Boolean).join(' ')}>
    {items.map(([k, v], i) => (
      <div key={i} style={{ display: 'contents' }}>
        <dt>{k}</dt>
        <dd>{v ?? <span className="faint">—</span>}</dd>
      </div>
    ))}
  </dl>
);

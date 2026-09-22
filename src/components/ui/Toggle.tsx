import type { ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  gloss?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  name?: string;
}

const Check = () => (
  <svg className="toggle__check" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

export const Toggle = ({ checked, onChange, label, gloss, icon, danger, disabled, name }: ToggleProps) => (
  <label className={['toggle', danger ? 'toggle--danger' : ''].filter(Boolean).join(' ')}>
    <input type="checkbox" className="visually-hidden" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    {icon && <span className="toggle__icon">{icon}</span>}
    <span className="toggle__body">
      <span className="toggle__label">{label}</span>
      {gloss && <span className="toggle__gloss">{gloss}</span>}
    </span>
    <span className="toggle__box" aria-hidden="true">
      <Check />
    </span>
  </label>
);

interface ToggleListProps<K extends string> {
  items: Array<{ key: K; label: ReactNode; gloss?: ReactNode; icon?: ReactNode; danger?: boolean }>;
  value: K[];
  onChange: (value: K[]) => void;
  /** Clave de la opción exclusiva ("Ninguno") que limpia las demás. */
  exclusiveKey?: K;
  grid?: boolean;
}

export function ToggleList<K extends string>({ items, value, onChange, exclusiveKey, grid }: ToggleListProps<K>) {
  const toggle = (key: K, next: boolean) => {
    if (key === exclusiveKey) {
      onChange(next ? [key] : []);
      return;
    }
    const without = value.filter((k) => k !== key && k !== exclusiveKey);
    onChange(next ? [...without, key] : without);
  };
  return (
    <div className={['toggle-list', grid ? 'toggle-list--grid' : ''].filter(Boolean).join(' ')}>
      {items.map((it) => (
        <Toggle key={it.key} checked={value.includes(it.key)} onChange={(n) => toggle(it.key, n)} label={it.label} gloss={it.gloss} icon={it.icon} danger={it.danger} />
      ))}
    </div>
  );
}

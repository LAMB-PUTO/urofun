import type { ReactNode } from 'react';
import { useId } from 'react';

export interface OptionItem<V extends string | number> {
  value: V;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

interface Props<V extends string | number> {
  name?: string;
  options: OptionItem<V>[];
  value: V | null | undefined;
  onChange: (value: V) => void;
  layout?: 'list' | 'grid' | 'inline';
  /** Muestra el valor numérico junto al anillo (instrumentos puntuados). */
  showValues?: boolean;
  legend?: { min: string; max: string };
  ariaLabel?: string;
  autoFocus?: boolean;
}

const Check = () => (
  <svg className="option__check" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
);

export function OptionGroup<V extends string | number>({ name, options, value, onChange, layout = 'list', showValues, legend, ariaLabel, autoFocus }: Props<V>) {
  const id = useId();
  const groupName = name ?? id;
  return (
    <div className={['optgroup', layout === 'grid' ? 'optgroup--grid' : '', layout === 'inline' ? 'optgroup--inline' : ''].filter(Boolean).join(' ')} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, i) => {
        const checked = value !== null && value !== undefined && String(value) === String(opt.value);
        return (
          <label key={String(opt.value)} className="option">
            <input
              type="radio"
              className="visually-hidden"
              name={groupName}
              value={String(opt.value)}
              checked={checked}
              disabled={opt.disabled}
              autoFocus={autoFocus && i === 0}
              onChange={() => onChange(opt.value)}
            />
            <span className="option__ring" aria-hidden="true">
              <Check />
            </span>
            <span className="option__label">
              {opt.label}
              {opt.hint && <span className="small muted"> · {opt.hint}</span>}
            </span>
            {showValues && typeof opt.value === 'number' && <span className="option__value num">{opt.value}</span>}
          </label>
        );
      })}
      {legend && layout === 'grid' && (
        <div className="optgroup__legend" style={{ gridColumn: '1 / -1' }}>
          <span>{legend.min}</span>
          <span>{legend.max}</span>
        </div>
      )}
    </div>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  iconOnly?: boolean;
}

export const buttonClass = ({ variant = 'primary', size = 'md', block, loading, iconOnly }: BaseProps, extra?: string) =>
  ['btn', `btn--${variant}`, size !== 'md' ? `btn--${size}` : '', block ? 'btn--block' : '', loading ? 'is-loading' : '', iconOnly ? 'btn--icon' : '', extra ?? '']
    .filter(Boolean)
    .join(' ');

export const Dots = () => (
  <span className="dots" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);

export const Button = ({ variant, size, block, loading, icon, iconRight, iconOnly, className, children, disabled, type = 'button', ...rest }: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type={type} className={buttonClass({ variant, size, block, loading, iconOnly }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
    {icon}
    {children}
    {iconRight}
    {loading && <Dots />}
  </button>
);

export const ButtonLink = ({ to, variant, size, block, icon, iconRight, className, children, ...rest }: BaseProps & { to: string; children?: ReactNode; className?: string; onClick?: () => void }) => (
  <Link to={to} className={buttonClass({ variant, size, block }, className)} {...rest}>
    {icon}
    {children}
    {iconRight}
  </Link>
);

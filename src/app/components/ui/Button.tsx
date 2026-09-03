import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-sm hover:from-brand-500 hover:to-accent-500 disabled:from-slate-400 disabled:to-slate-400',
  secondary: 'bg-surface-3 text-fg hover:bg-brand-50 dark:hover:bg-ink-700 border border-default',
  outline: 'border border-strong bg-transparent text-fg hover:bg-surface-3',
  ghost: 'bg-transparent text-fg hover:bg-surface-3',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm font-semibold gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={iconSize} aria-hidden />
      ) : null}
      {children}
      {IconRight ? <IconRight size={iconSize} aria-hidden /> : null}
    </button>
  );
}

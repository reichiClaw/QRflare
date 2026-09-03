import { Eye, EyeOff } from 'lucide-react';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { toHex } from '@shared/style/color';

import { cn } from '../../lib/cn';

interface FieldShellProps {
  label: ReactNode;
  htmlFor: string;
  description?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  inline?: boolean;
  required?: boolean;
}

export function FieldShell({
  label,
  htmlFor,
  description,
  error,
  hint,
  className,
  children,
  inline,
  required,
}: FieldShellProps) {
  return (
    <div
      className={cn(inline ? 'flex items-center justify-between gap-3' : 'flex flex-col gap-1.5', className)}
    >
      <div className={cn(inline && 'min-w-0')}>
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
          {required ? (
            <span className="ml-0.5 text-red-500" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {description ? (
          <p id={`${htmlFor}-desc`} className="text-xs text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-err`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hasDesc: boolean, hasError: boolean): string | undefined {
  const ids = [hasDesc && `${id}-desc`, hasError && `${id}-err`].filter(Boolean) as string[];
  return ids.length ? ids.join(' ') : undefined;
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  secret?: boolean;
  containerClassName?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  description,
  error,
  hint,
  secret,
  containerClassName,
  id,
  className,
  required,
  ...rest
}: TextInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const type = secret ? (revealed ? 'text' : 'password') : (rest.type ?? 'text');
  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      hint={hint}
      className={containerClassName}
      required={required}
    >
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type={type}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, Boolean(description), Boolean(error))}
          className={cn('field-input', secret && 'pr-10', className)}
          autoComplete={secret ? 'off' : rest.autoComplete}
          spellCheck={secret ? false : rest.spellCheck}
        />
        {secret ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-fg"
            aria-label={revealed ? 'Hide value' : 'Show value'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        ) : null}
      </div>
    </FieldShell>
  );
}

export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  mono?: boolean;
}

export function TextArea({
  label,
  value,
  onChange,
  description,
  error,
  hint,
  id,
  className,
  mono,
  required,
  ...rest
}: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      hint={hint}
      required={required}
    >
      <textarea
        {...rest}
        id={inputId}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, Boolean(description), Boolean(error))}
        className={cn('field-input min-h-24 resize-y', mono && 'font-mono text-xs', className)}
      />
    </FieldShell>
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  description?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  inline?: boolean;
}

export function Select({
  label,
  value,
  onChange,
  options,
  description,
  error,
  hint,
  id,
  className,
  inline,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      hint={hint}
      inline={inline}
    >
      <select
        {...rest}
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, Boolean(description), Boolean(error))}
        className={cn('field-input', inline && 'w-auto', className)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface NumberInputProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  description?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  id?: string;
  inline?: boolean;
  suffix?: string;
  disabled?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  description,
  error,
  hint,
  id,
  inline,
  suffix,
  disabled,
}: NumberInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) {
      setDraft(null);
      return;
    }
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (Number.isInteger(step)) next = Math.round(next);
    onChange(next);
    setDraft(null);
  };
  return (
    <FieldShell
      label={label}
      htmlFor={inputId}
      description={description}
      error={error}
      hint={hint}
      inline={inline}
    >
      <div className={cn('flex items-center gap-1.5', inline && 'w-32')}>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, Boolean(description), Boolean(error))}
          className="field-input tabular-nums"
        />
        {suffix ? <span className="text-xs text-muted">{suffix}</span> : null}
      </div>
    </FieldShell>
  );
}

export interface SliderProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  description?: ReactNode;
  id?: string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  description,
  id,
  disabled,
}: SliderProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
        <output htmlFor={inputId} className="text-xs tabular-nums text-muted">
          {format ? format(value) : value}
        </output>
      </div>
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  id?: string;
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, description, id, disabled }: SwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-brand-600 bg-brand-600' : 'border-strong bg-surface-3',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export interface ColorInputProps {
  label: ReactNode;
  value: string;
  onChange: (hex: string) => void;
  description?: ReactNode;
  id?: string;
  disabled?: boolean;
}

/** Colour picker with hex/rgb() text entry and a native visual picker. */
export function ColorInput({ label, value, onChange, description, id, disabled }: ColorInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = (raw: string) => {
    const hex = toHex(raw);
    if (hex) {
      onChange(hex.slice(0, 7));
      setInvalid(false);
    } else {
      setInvalid(true);
    }
    setDraft(null);
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-fg">
        {label}
      </label>
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.slice(0, 7)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${typeof label === 'string' ? label : 'Colour'} picker`}
          className="h-9 w-10 cursor-pointer rounded-md"
        />
        <input
          id={inputId}
          type="text"
          inputMode="text"
          spellCheck={false}
          disabled={disabled}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${inputId}-err` : undefined}
          className="field-input font-mono text-xs uppercase"
          placeholder="#000000 or rgb(0,0,0)"
        />
      </div>
      {invalid ? (
        <p id={`${inputId}-err`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          Enter a hex colour like #1D4ED8 or rgb(29, 78, 216).
        </p>
      ) : null}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  description?: ReactNode;
  columns?: number;
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  description,
  columns,
}: SegmentedProps<T>) {
  const groupId = useId();
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={groupId}>
      <span id={groupId} className="text-sm font-medium text-fg">
        {label}
      </span>
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      <div
        className={cn('grid gap-1 rounded-lg border border-default bg-surface-3 p-1')}
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              o.value === value
                ? 'bg-surface-2 text-fg shadow-sm ring-1 ring-brand-500/40'
                : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

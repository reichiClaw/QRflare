import { AlertTriangle, CheckCircle2, ChevronDown, Info, X, XCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { useToasts, type Toast } from '../../store/toast';
import { Button } from './Button';

/* ---------- Collapsible ---------- */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  badge,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn('rounded-xl border border-default', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-3"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="border-t border-default px-3 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Tabs ---------- */
export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  tabs: Array<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (tab) {
      onChange(tab.id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-1 overflow-x-auto rounded-xl bg-surface-3 p-1 scroll-thin', className)}
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
              selected
                ? 'bg-surface-2 text-fg shadow-sm ring-1 ring-brand-500/40'
                : 'text-muted hover:text-fg',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel<T extends string>({
  id,
  active,
  children,
  className,
}: {
  id: T;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={cn('outline-none', className)}
    >
      {children}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    info: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Dialog ---------- */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[min(92vw,var(--dialog-w))] rounded-2xl border border-default bg-surface-2 p-0 text-fg shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm',
      )}
      style={{ ['--dialog-w' as string]: size === 'sm' ? '24rem' : size === 'lg' ? '48rem' : '32rem' }}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-default px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog" icon={X} />
          </div>
          {children ? <div className="overflow-y-auto px-5 py-4 scroll-thin">{children}</div> : null}
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-default px-5 py-3">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Continue',
  danger = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* ---------- Toasts ---------- */
const toastIcons = {
  success: <CheckCircle2 size={18} className="text-emerald-500" aria-hidden />,
  error: <XCircle size={18} className="text-red-500" aria-hidden />,
  info: <Info size={18} className="text-brand-500" aria-hidden />,
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t: Toast) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-default bg-surface-2 px-4 py-3 shadow-lg"
        >
          {toastIcons[t.kind]}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.description ? <p className="text-xs text-muted">{t.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="text-muted hover:text-fg"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Callout ---------- */
export function Callout({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const map = {
    info: [
      'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900/60 dark:bg-brand-900/20 dark:text-brand-100',
      <Info size={16} aria-hidden key="i" />,
    ],
    warning: [
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100',
      <AlertTriangle size={16} aria-hidden key="w" />,
    ],
    danger: [
      'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-100',
      <XCircle size={16} aria-hidden key="d" />,
    ],
    success: [
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-100',
      <CheckCircle2 size={16} aria-hidden key="s" />,
    ],
  } as const;
  const [classes, icon] = map[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', classes, className)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h3>
      {action}
    </div>
  );
}

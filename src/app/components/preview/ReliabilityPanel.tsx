import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from 'lucide-react';

import type { PrepareResult } from '@shared/pipeline';
import type { ReliabilityStatus, Severity } from '@shared/quality/reliability';

import { cn } from '../../lib/cn';
import { useEditor } from '../../store/editor';
import { Button } from '../ui/Button';
import { Badge, SectionTitle } from '../ui/Primitives';

const STATUS: Record<
  ReliabilityStatus,
  { label: string; tone: 'success' | 'info' | 'warning' | 'danger'; icon: typeof CheckCircle2 }
> = {
  excellent: { label: 'Excellent', tone: 'success', icon: CheckCircle2 },
  good: { label: 'Good', tone: 'info', icon: CheckCircle2 },
  risky: { label: 'Risky', tone: 'warning', icon: ShieldAlert },
  invalid: { label: 'Invalid', tone: 'danger', icon: XCircle },
};

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: XCircle,
};
const SEVERITY_CLASS: Record<Severity, string> = {
  info: 'text-brand-600 dark:text-brand-300',
  warning: 'text-amber-600 dark:text-amber-300',
  critical: 'text-red-600 dark:text-red-400',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-3 px-2.5 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function ReliabilityPanel({ result }: { result: PrepareResult | null }) {
  const applySafeDefaults = useEditor((s) => s.applySafeDefaults);
  const dirty = useEditor((s) => s.dirty);

  if (!result) return null;
  if (!result.ok) {
    if (!dirty) return null;
    return (
      <section
        aria-labelledby="reliability-heading"
        className="flex flex-col gap-2"
        data-testid="reliability"
      >
        <SectionTitle>
          <span id="reliability-heading">Scan reliability</span>
        </SectionTitle>
        <div className="flex items-center gap-2">
          <Badge tone="danger">
            <XCircle size={12} aria-hidden /> Invalid
          </Badge>
          <span className="text-xs text-muted">Fix the content to generate a code.</span>
        </div>
        <ul className="flex flex-col gap-1 text-xs">
          {result.issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`} className="flex gap-2 text-red-600 dark:text-red-400">
              <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {issue.path ? <span className="font-mono text-[11px] text-muted">{issue.path}: </span> : null}
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const { reliability, encode } = result;
  const status = STATUS[reliability.status];
  const StatusIcon = status.icon;
  const facts = reliability.facts;

  return (
    <section aria-labelledby="reliability-heading" className="flex flex-col gap-3" data-testid="reliability">
      <SectionTitle
        action={
          reliability.status !== 'excellent' ? (
            <Button size="sm" variant="outline" onClick={applySafeDefaults}>
              Safe defaults
            </Button>
          ) : null
        }
      >
        <span id="reliability-heading">Scan reliability</span>
      </SectionTitle>
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <Badge tone={status.tone}>
          <StatusIcon size={12} aria-hidden /> {status.label}
        </Badge>
        <span className="text-xs text-muted">Score {reliability.score}/100</span>
      </div>
      <dl className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        <Fact label="Version" value={`${encode.version}`} />
        <Fact label="Matrix" value={`${encode.matrix.size}×${encode.matrix.size}`} />
        <Fact label="Error corr." value={encode.errorCorrection} />
        <Fact label="Bytes" value={`${encode.byteLength}`} />
        <Fact label="Capacity" value={`${encode.usagePercent}%`} />
        <Fact label="Free" value={`${facts.remainingBytes ?? 0} B`} />
        <Fact label="Quiet zone" value={`${facts.quietZone} mod`} />
        <Fact label="Contrast" value={facts.contrast === null ? '—' : `${facts.contrast.toFixed(1)}:1`} />
      </dl>
      {reliability.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {reliability.warnings.map((w) => {
            const Icon = SEVERITY_ICON[w.severity];
            return (
              <li key={w.id} className="flex gap-2 text-xs">
                <Icon size={14} className={cn('mt-0.5 shrink-0', SEVERITY_CLASS[w.severity])} aria-hidden />
                <span>
                  <span className="sr-only">{w.severity}: </span>
                  {w.message}
                  {w.hint ? <span className="text-muted"> {w.hint}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">No issues detected. This code should scan reliably.</p>
      )}
    </section>
  );
}

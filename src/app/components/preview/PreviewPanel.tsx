import { Loader2, QrCode, ShieldCheck } from 'lucide-react';

import type { PrepareResult } from '@shared/pipeline';

import { cn } from '../../lib/cn';
import { useEditor } from '../../store/editor';
import { Callout } from '../ui/Primitives';

export function PreviewPanel({
  result,
  previewUrl,
  pending,
  compact = false,
}: {
  result: PrepareResult | null;
  previewUrl: string | null;
  pending: boolean;
  compact?: boolean;
}) {
  const transparent = useEditor((s) => s.style.transparentBackground);
  const dirty = useEditor((s) => s.dirty);
  const ok = result?.ok === true;

  return (
    <div className={cn('flex flex-col items-center gap-3', compact ? '' : 'w-full')}>
      <div
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-default',
          transparent ? 'checker' : 'bg-white dark:bg-slate-950/40',
          compact ? 'aspect-square max-w-[128px]' : 'aspect-square max-w-[560px]',
        )}
        aria-busy={pending}
      >
        {ok && previewUrl ? (
          <img
            src={previewUrl}
            alt={`Live QR code preview (${result.content.type})`}
            className="h-full w-full object-contain p-2"
            data-testid="qr-preview"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-muted">
            <QrCode size={compact ? 32 : 56} strokeWidth={1.25} aria-hidden />
            {result && !result.ok && dirty ? (
              <p className="max-w-xs text-sm">{result.issues[0]?.message ?? result.message}</p>
            ) : (
              <p className={cn('max-w-xs', compact ? 'text-xs' : 'text-sm')}>
                Your QR code appears here as soon as the content is valid.
              </p>
            )}
          </div>
        )}
        {pending ? (
          <span
            className="absolute right-2 top-2 rounded-full bg-surface-2/90 p-1 text-muted"
            aria-label="Updating preview"
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
          </span>
        ) : null}
      </div>
      {!compact ? (
        <Callout tone="success" className="w-full max-w-[560px]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden />
            Generated locally in your browser. The content is not uploaded or logged.
          </span>
        </Callout>
      ) : null}
    </div>
  );
}

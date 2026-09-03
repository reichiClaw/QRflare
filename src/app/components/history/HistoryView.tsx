import { History as HistoryIcon, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { getContentMeta } from '@shared/content/registry';

import { TypeIcon } from '../../lib/icons';
import { useEditor } from '../../store/editor';
import { useHistory } from '../../store/history';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { Callout, ConfirmDialog } from '../ui/Primitives';

export function HistoryView({ onRestore }: { onRestore: () => void }) {
  const entries = useHistory((s) => s.entries);
  const remove = useHistory((s) => s.remove);
  const clear = useHistory((s) => s.clear);
  const enabled = useSettings((s) => s.historyEnabled);
  const update = useSettings((s) => s.update);
  const loadSnapshot = useEditor((s) => s.loadSnapshot);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Generation history</h1>
          <p className="text-sm text-muted">
            Restore previous designs. Stored only in this browser; never synchronised.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          disabled={entries.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          Clear all
        </Button>
      </div>

      {!enabled ? (
        <Callout tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              History is disabled. Entries include the full content – enable it only on a device you trust.
            </span>
            <Button size="sm" variant="outline" onClick={() => update({ historyEnabled: true })}>
              Enable history
            </Button>
          </div>
        </Callout>
      ) : (
        <Callout tone="warning">
          History may contain sensitive information (passwords, contacts, payment data, 2FA secrets). Clear it
          when you are done.
        </Callout>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-strong p-10 text-center text-muted">
          <HistoryIcon size={32} strokeWidth={1.25} aria-hidden />
          <p className="text-sm">
            No entries yet. {enabled ? 'Download or copy a code to add it here.' : ''}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const meta = getContentMeta(entry.type);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-default bg-surface-2 p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  <TypeIcon name={meta.icon} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{meta.label}</p>
                  <p className="truncate font-mono text-xs text-muted">{entry.preview}</p>
                  <p className="text-[11px] text-muted">
                    {new Date(entry.createdAt).toLocaleString()} · {entry.output.format.toUpperCase()}{' '}
                    {entry.output.size}px
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => {
                    loadSnapshot({
                      content: entry.content,
                      qr: entry.qr,
                      style: entry.style,
                      output: entry.output,
                    });
                    toast.success('Design restored');
                    onRestore();
                  }}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label="Delete entry"
                  onClick={() => remove(entry.id)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the entire history?"
        description="All saved entries are deleted immediately from this browser."
        confirmLabel="Clear history"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clear();
          setConfirmClear(false);
          toast.success('History cleared');
        }}
      />
    </div>
  );
}

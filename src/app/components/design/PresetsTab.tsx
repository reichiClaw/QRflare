import { Check, Download, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { encodeQr } from '@shared/qr/encode';
import { renderSvg } from '@shared/render/svg';
import { BUILT_IN_PRESETS, type Preset } from '@shared/style/presets';
import { resolveStyle } from '@shared/style/schema';

import { downloadText, readFileAsText } from '../../lib/download';
import { useEditor } from '../../store/editor';
import { usePresets } from '../../store/presets';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Field';
import { ConfirmDialog, Dialog, SectionTitle } from '../ui/Primitives';

const SAMPLE = encodeQr('EdgeQR presets', { errorCorrection: 'M', boostErrorCorrection: false });

function presetThumb(preset: Preset): string {
  const style = resolveStyle({ ...preset.style, logo: { enabled: false } });
  const svg = renderSvg({ matrix: SAMPLE.matrix, marginModules: 2, style, size: 96 }).svg;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function PresetCard({
  preset,
  onApply,
  onRename,
  onDelete,
}: {
  preset: Preset;
  onApply: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-1 rounded-xl border border-default bg-surface-2 p-2">
      <button
        type="button"
        onClick={onApply}
        className="flex flex-col items-center gap-1.5 rounded-lg text-center hover:bg-surface-3"
        aria-label={`Apply preset ${preset.name}`}
      >
        <img src={presetThumb(preset)} alt="" width={72} height={72} className="rounded-md" />
        <span className="w-full truncate text-xs font-medium">{preset.name}</span>
        {preset.description ? (
          <span className="line-clamp-2 text-[10px] text-muted">{preset.description}</span>
        ) : null}
      </button>
      {onRename || onDelete ? (
        <div className="flex justify-center gap-1">
          {onRename ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              aria-label={`Rename ${preset.name}`}
              onClick={onRename}
            />
          ) : null}
          {onDelete ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              aria-label={`Delete ${preset.name}`}
              onClick={onDelete}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PresetsTab() {
  const style = useEditor((s) => s.style);
  const applyPreset = useEditor((s) => s.applyPreset);
  const resetStyle = useEditor((s) => s.resetStyle);
  const custom = usePresets((s) => s.custom);
  const savePreset = usePresets((s) => s.save);
  const renamePreset = usePresets((s) => s.rename);
  const removePreset = usePresets((s) => s.remove);
  const importJson = usePresets((s) => s.importFromJson);
  const exportJson = usePresets((s) => s.exportToJson);
  const restoreDefaults = usePresets((s) => s.restoreDefaults);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const apply = (preset: Preset) => {
    applyPreset(preset);
    toast.success(`Applied “${preset.name}”`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionTitle
          action={
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetStyle}>
              Factory style
            </Button>
          }
        >
          Built-in presets
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {BUILT_IN_PRESETS.map((p) => (
            <PresetCard key={p.id} preset={p} onApply={() => apply(p)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle
          action={
            <div className="flex gap-1">
              <Button size="sm" variant="outline" icon={Plus} onClick={() => setSaveOpen(true)}>
                Save current
              </Button>
            </div>
          }
        >
          My presets
        </SectionTitle>
        {custom.length === 0 ? (
          <p className="rounded-lg border border-dashed border-strong p-3 text-center text-xs text-muted">
            Save the current style to reuse it later. Presets are stored only in this browser.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {custom.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                onApply={() => apply(p)}
                onRename={() => {
                  setRenaming(p);
                  setName(p.name);
                }}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            disabled={custom.length === 0}
            onClick={() => {
              downloadText(exportJson(), 'edgeqr-presets.json', 'application/json');
              toast.success('Presets exported');
            }}
          >
            Export JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Import presets file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const outcome = importJson(await readFileAsText(file));
              if (outcome.error) toast.error('Import failed', outcome.error);
              else toast.success(`Imported ${outcome.imported} preset${outcome.imported === 1 ? '' : 's'}`);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="ghost" icon={Upload} onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            disabled={custom.length === 0}
            onClick={() => setConfirmRestore(true)}
          >
            Restore factory defaults
          </Button>
        </div>
      </div>

      <Dialog
        open={saveOpen || renaming !== null}
        onClose={() => {
          setSaveOpen(false);
          setRenaming(null);
        }}
        title={renaming ? 'Rename preset' : 'Save preset'}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setSaveOpen(false);
                setRenaming(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Check}
              onClick={() => {
                if (renaming) {
                  renamePreset(renaming.id, name);
                  toast.success('Preset renamed');
                } else {
                  const preset = savePreset(name, style);
                  toast.success(`Saved “${preset.name}”`);
                }
                setName('');
                setSaveOpen(false);
                setRenaming(null);
              }}
            >
              {renaming ? 'Rename' : 'Save'}
            </Button>
          </>
        }
      >
        <TextInput
          label="Preset name"
          value={name}
          onChange={setName}
          placeholder="Brand blue"
          autoFocus
          maxLength={60}
          description={renaming ? undefined : 'The logo image is not stored in presets.'}
        />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="This removes the preset from this browser."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) removePreset(deleting.id);
          setDeleting(null);
          toast.success('Preset deleted');
        }}
      />
      <ConfirmDialog
        open={confirmRestore}
        title="Remove all custom presets?"
        description="Built-in presets stay available. Export your presets first if you want to keep them."
        confirmLabel="Restore defaults"
        danger
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => {
          restoreDefaults();
          setConfirmRestore(false);
          toast.success('Custom presets removed');
        }}
      />
    </div>
  );
}

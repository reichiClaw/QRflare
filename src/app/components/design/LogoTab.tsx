import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';

import type { PrepareResult } from '@shared/pipeline';

import { cn } from '../../lib/cn';
import { prepareLogoFile } from '../../lib/logo';
import { useEditor } from '../../store/editor';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { ColorInput, Slider, Switch } from '../ui/Field';
import { Callout, SectionTitle } from '../ui/Primitives';

export function LogoTab({ result }: { result: PrepareResult | null }) {
  const logo = useEditor((s) => s.style.logo);
  const qr = useEditor((s) => s.qr);
  const setStyle = useEditor((s) => s.setStyle);
  const setQr = useEditor((s) => s.setQr);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareLogoFile(file);
      setStyle({ logo: { enabled: true, dataUrl: prepared.dataUrl } }, 'logo-upload');
      if (prepared.removed.length > 0) {
        toast.info(
          'SVG logo sanitized',
          `Removed: ${prepared.removed.slice(0, 3).join(', ')}${prepared.removed.length > 3 ? '…' : ''}`,
        );
      } else {
        toast.success(
          'Logo added',
          prepared.downscaled ? 'The image was scaled down to keep the export small.' : undefined,
        );
      }
    } catch (error) {
      toast.error('Logo rejected', error instanceof Error ? error.message : 'Unsupported file');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  const coverage = result?.ok ? result.render.logoCoverage : 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Logo</SectionTitle>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-strong',
        )}
      >
        {logo.dataUrl ? (
          <img
            src={logo.dataUrl}
            alt="Uploaded logo preview"
            className="h-16 w-16 rounded-lg object-contain checker"
          />
        ) : (
          <ImagePlus size={28} className="text-muted" aria-hidden />
        )}
        <p className="text-xs text-muted">Drag a PNG, JPG, WebP or SVG here, or</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
          aria-label="Choose a logo file"
          data-testid="logo-input"
        />
        <div className="flex gap-2">
          <Button size="sm" icon={Upload} onClick={() => inputRef.current?.click()} loading={busy}>
            {logo.dataUrl ? 'Replace logo' : 'Choose file'}
          </Button>
          {logo.dataUrl ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => setStyle({ logo: { enabled: false, dataUrl: undefined } }, 'logo-remove')}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-muted">
          Processed locally. SVG files are sanitized; scripts and external references are removed.
        </p>
      </div>

      {logo.dataUrl ? (
        <>
          <Switch
            label="Show logo"
            checked={logo.enabled}
            onChange={(enabled) => setStyle({ logo: { enabled } }, 'logo-enabled')}
          />
          <Slider
            label="Scale"
            min={0.05}
            max={0.4}
            step={0.01}
            value={logo.scale}
            onChange={(scale) => setStyle({ logo: { scale } }, 'logo-scale')}
            format={(v) => `${Math.round(v * 100)}%`}
            description="Relative to the QR width. The logo never covers the finder patterns."
          />
          <Slider
            label="Padding"
            min={0}
            max={4}
            step={0.25}
            value={logo.padding}
            onChange={(padding) => setStyle({ logo: { padding } }, 'logo-padding')}
            format={(v) => `${v} mod`}
          />
          <Slider
            label="Logo corner radius"
            min={0}
            max={0.5}
            step={0.05}
            value={logo.cornerRadius}
            onChange={(cornerRadius) => setStyle({ logo: { cornerRadius } }, 'logo-radius')}
            format={(v) => `${Math.round(v * 200)}%`}
          />
          <Switch
            label="Clear modules behind the logo"
            description="Removes data modules under the logo area (relies on error correction)."
            checked={logo.clearModules}
            onChange={(clearModules) => setStyle({ logo: { clearModules } }, 'logo-clear')}
          />
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Switch
              label="Solid backplate"
              checked={logo.backplate.enabled}
              onChange={(enabled) => setStyle({ logo: { backplate: { enabled } } }, 'backplate')}
            />
            {logo.backplate.enabled ? (
              <>
                <ColorInput
                  label="Backplate colour"
                  value={logo.backplate.color}
                  onChange={(color) => setStyle({ logo: { backplate: { color } } }, 'backplate-color')}
                />
                <Slider
                  label="Backplate corner radius"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={logo.backplate.cornerRadius}
                  onChange={(cornerRadius) =>
                    setStyle({ logo: { backplate: { cornerRadius } } }, 'backplate-radius')
                  }
                  format={(v) => `${Math.round(v * 200)}%`}
                />
              </>
            ) : null}
          </div>
          {logo.enabled ? (
            <p className="text-xs text-muted">
              The logo box covers {Math.round(coverage * 100)}% of the modules.
            </p>
          ) : null}
          {logo.enabled && qr.errorCorrection !== 'H' ? (
            <Callout tone="warning">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Logos hide modules – error correction H recovers up to 30 %.</span>
                <Button size="sm" variant="outline" onClick={() => setQr({ errorCorrection: 'H' })}>
                  Use level H
                </Button>
              </div>
            </Callout>
          ) : null}
          {logo.enabled && coverage > 0.18 ? (
            <Callout tone="danger">
              The logo covers a lot of the code. Reduce the scale if scanning becomes unreliable.
            </Callout>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

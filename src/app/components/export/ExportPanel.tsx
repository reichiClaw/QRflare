import { Clipboard, Code2, Copy, Download, FileImage, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { PrepareResult } from '@shared/pipeline';
import { buildDownloadName } from '@shared/security/filename';
import {
  MAX_OUTPUT_SIZE,
  MIN_OUTPUT_SIZE,
  OUTPUT_SIZE_PRESETS,
  type OutputFormat,
} from '@shared/style/schema';

import { canCopyImages, copyPngBlob, copyText, downloadBlob } from '../../lib/download';
import { apiRequestBody, curlExample, exportArtifact, exportDataUrl, ExportError } from '../../lib/export';
import { useEditor } from '../../store/editor';
import { useHistory } from '../../store/history';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { ColorInput, NumberInput, Segmented, Slider, TextInput } from '../ui/Field';
import { Callout, Collapsible, SectionTitle } from '../ui/Primitives';

export function ExportPanel({ result }: { result: PrepareResult | null }) {
  const output = useEditor((s) => s.output);
  const setOutput = useEditor((s) => s.setOutput);
  const transparent = useEditor((s) => s.style.transparentBackground);
  const historyEnabled = useSettings((s) => s.historyEnabled);
  const addHistory = useHistory((s) => s.add);
  const [busy, setBusy] = useState<string | null>(null);

  const ready = result?.ok === true;
  const filename = buildDownloadName(
    output.filename,
    output.format,
    ready ? `${result.content.type}-qr` : 'qr-code',
  );

  const snapshot = () => {
    const s = useEditor.getState();
    return { content: s.content, qr: s.qr, style: s.style, output: s.output };
  };

  const remember = (preview: string) => {
    if (!historyEnabled || !ready) return;
    const s = snapshot();
    addHistory({
      type: s.content.type,
      preview: preview.slice(0, 80),
      content: s.content,
      qr: s.qr,
      style: s.style,
      output: s.output,
    });
  };

  const run = async (key: string, task: () => Promise<void>) => {
    if (!ready) return;
    setBusy(key);
    try {
      await task();
    } catch (error) {
      toast.error(
        'Export failed',
        error instanceof ExportError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error',
      );
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('download', async () => {
      const artifact = await exportArtifact(snapshot(), output.format);
      downloadBlob(artifact.blob, artifact.filename);
      remember(artifact.prepared.payload);
      toast.success(
        `Downloaded ${artifact.filename}`,
        `${artifact.mimeType} · ${Math.round(artifact.blob.size / 1024)} KB`,
      );
    });

  const copyPng = () =>
    run('copy-png', async () => {
      const artifact = await exportArtifact(snapshot(), 'png');
      const ok = await copyPngBlob(artifact.blob);
      if (ok) {
        remember(artifact.prepared.payload);
        toast.success('PNG copied to clipboard');
      } else toast.error('Clipboard unavailable', 'This browser does not allow copying images.');
    });

  const copySvg = () =>
    run('copy-svg', async () => {
      const artifact = await exportArtifact(snapshot(), 'svg');
      const ok = await copyText(await artifact.blob.text());
      if (ok) toast.success('SVG source copied');
      else toast.error('Clipboard unavailable');
    });

  const copyDataUrl = () =>
    run('copy-data-url', async () => {
      const url = await exportDataUrl(snapshot(), output.format);
      const ok = await copyText(url);
      if (ok) toast.success('Data URL copied', `${Math.round(url.length / 1024)} KB`);
      else toast.error('Clipboard unavailable');
    });

  const apiBody = useMemo(() => apiRequestBody(snapshot(), output.format), [output.format, result]); // eslint-disable-line react-hooks/exhaustive-deps
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-worker.workers.dev';

  return (
    <section aria-labelledby="export-heading" className="flex flex-col gap-4" data-testid="export-panel">
      <SectionTitle>
        <span id="export-heading">Export</span>
      </SectionTitle>

      <Segmented
        label="Format"
        value={output.format}
        onChange={(format: OutputFormat) => setOutput({ format })}
        options={[
          { value: 'png', label: 'PNG', title: 'Lossless raster with transparency' },
          { value: 'jpeg', label: 'JPG', title: 'Lossy raster without transparency' },
          { value: 'svg', label: 'SVG', title: 'Scalable vector' },
        ]}
      />

      {output.format !== 'svg' ? (
        <div className="flex flex-col gap-2">
          <Segmented
            label="Width"
            value={String(
              OUTPUT_SIZE_PRESETS.includes(output.size as (typeof OUTPUT_SIZE_PRESETS)[number])
                ? output.size
                : 'custom',
            )}
            onChange={(v) => {
              if (v !== 'custom') setOutput({ size: Number(v) });
            }}
            options={[
              ...OUTPUT_SIZE_PRESETS.map((s) => ({ value: String(s), label: `${s}` })),
              { value: 'custom', label: 'Custom' },
            ]}
            columns={6}
          />
          <NumberInput
            label="Custom width (px)"
            value={output.size}
            onChange={(size) => setOutput({ size })}
            min={MIN_OUTPUT_SIZE}
            max={MAX_OUTPUT_SIZE}
            inline
            suffix="px"
          />
        </div>
      ) : (
        <p className="text-xs text-muted">
          SVG output is resolution independent. Its width attribute uses {output.size} px.
        </p>
      )}

      {output.format === 'jpeg' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
          <Slider
            label="JPEG quality"
            min={1}
            max={100}
            value={output.jpegQuality}
            onChange={(jpegQuality) => setOutput({ jpegQuality })}
            format={(v) => `${v}%`}
          />
          <ColorInput
            label="Flatten transparency onto"
            value={output.jpegBackground}
            onChange={(jpegBackground) => setOutput({ jpegBackground })}
          />
          {transparent ? (
            <Callout tone="warning">
              JPEG cannot store transparency. The transparent background is filled with the colour above.
            </Callout>
          ) : (
            <Callout tone="info">JPEG has no alpha channel; PNG or SVG keep transparency.</Callout>
          )}
        </div>
      ) : null}

      <TextInput
        label="File name"
        value={output.filename ?? ''}
        onChange={(filename) => setOutput({ filename: filename || undefined })}
        placeholder={filename.replace(/\.[a-z]+$/, '')}
        hint={`Saved as ${filename}`}
        autoCapitalize="off"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          size="lg"
          icon={Download}
          onClick={download}
          disabled={!ready}
          loading={busy === 'download'}
          className="col-span-2"
          data-testid="download-button"
        >
          Download {output.format.toUpperCase() === 'JPEG' ? 'JPG' : output.format.toUpperCase()}
        </Button>
        <Button
          icon={Clipboard}
          onClick={copyPng}
          disabled={!ready || !canCopyImages()}
          loading={busy === 'copy-png'}
          title={canCopyImages() ? 'Copy a PNG image' : 'Not supported by this browser'}
        >
          Copy PNG
        </Button>
        <Button icon={Code2} onClick={copySvg} disabled={!ready} loading={busy === 'copy-svg'}>
          Copy SVG
        </Button>
        <Button icon={Link2} onClick={copyDataUrl} disabled={!ready} loading={busy === 'copy-data-url'}>
          Copy data URL
        </Button>
        <Button
          icon={Copy}
          disabled={!ready}
          onClick={async () => {
            if (!ready) return;
            const ok = await copyText(result.payload);
            if (ok) toast.success('Payload copied');
            else toast.error('Clipboard unavailable');
          }}
        >
          Copy payload
        </Button>
      </div>

      {!ready ? (
        <p className="text-xs text-muted">
          Exports are enabled once the content is valid – invalid codes are never exported.
        </p>
      ) : null}

      <Collapsible
        title={
          <span className="inline-flex items-center gap-1.5">
            <FileImage size={14} aria-hidden /> Generate via HTTP API
          </span>
        }
      >
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-muted">
            The same design can be rendered server-side by this deployment's API. Unlike the editor, an API
            request sends the content to your Worker.
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-surface-3 p-3 font-mono text-[11px] scroll-thin">
            {curlExample(apiBody, origin, filename)}
          </pre>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={Copy}
              onClick={async () =>
                (await copyText(curlExample(apiBody, origin, filename))) &&
                toast.success('curl command copied')
              }
            >
              Copy curl
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={Copy}
              onClick={async () =>
                (await copyText(JSON.stringify(apiBody, null, 2))) && toast.success('JSON request copied')
              }
            >
              Copy JSON
            </Button>
          </div>
        </div>
      </Collapsible>
    </section>
  );
}

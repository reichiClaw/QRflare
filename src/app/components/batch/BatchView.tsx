import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Play,
  Square,
  Upload,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';

import { CsvError, parseCsv, tableToObjects } from '@shared/batch/csv';
import { exampleCsv, mapRow, type BatchRowResult } from '@shared/batch/rows';
import { CONTENT_REGISTRY } from '@shared/content/registry';
import { CONTENT_TYPES, type ContentType } from '@shared/content/schemas';
import { OUTPUT_SIZE_PRESETS, type OutputFormat } from '@shared/style/schema';

import { runBatch, type BatchResult } from '../../lib/batch';
import { cn } from '../../lib/cn';
import { downloadBlob, downloadText, readFileAsText } from '../../lib/download';
import { useEditor } from '../../store/editor';
import { allPresets, usePresets } from '../../store/presets';
import { useSettings } from '../../store/settings';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { Select, Switch } from '../ui/Field';
import { Badge, Callout } from '../ui/Primitives';

interface LoadedCsv {
  fileName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

export default function BatchView() {
  const batchLimit = useSettings((s) => s.batchLimit);
  const custom = usePresets((s) => s.custom);
  const output = useEditor((s) => s.output);
  const presets = useMemo(() => allPresets(custom), [custom]);

  const [csv, setCsv] = useState<LoadedCsv | null>(null);
  const [defaultType, setDefaultType] = useState<ContentType>('url');
  const [defaultFormat, setDefaultFormat] = useState<OutputFormat>('png');
  const [defaultSize, setDefaultSize] = useState(1024);
  const [includeManifest, setIncludeManifest] = useState(true);
  const [useApi, setUseApi] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mapped: BatchRowResult[] = useMemo(() => {
    if (!csv) return [];
    return csv.rows
      .slice(0, batchLimit)
      .map((row, i) =>
        mapRow(row, i, { type: defaultType, format: defaultFormat, size: defaultSize }, presets),
      );
  }, [csv, defaultType, defaultFormat, defaultSize, presets, batchLimit]);

  const validCount = mapped.filter((r) => r.request).length;
  const invalidCount = mapped.length - validCount;
  const truncated = csv ? Math.max(0, csv.rows.length - batchLimit) : 0;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const table = parseCsv(text, { maxRows: 5000 });
      setCsv({ fileName: file.name, headers: table.headers, rows: tableToObjects(table) });
      setResult(null);
      toast.success(
        `Loaded ${table.rows.length} row${table.rows.length === 1 ? '' : 's'}`,
        'Parsed locally – nothing was uploaded.',
      );
    } catch (error) {
      toast.error(
        'Could not read CSV',
        error instanceof CsvError
          ? `${error.message} (line ${error.line})`
          : error instanceof Error
            ? error.message
            : 'Unknown error',
      );
    }
  };

  const updateCell = (rowIndex: number, column: string, value: string) => {
    if (!csv) return;
    const rows = csv.rows.map((r, i) => (i === rowIndex ? { ...r, [column]: value } : r));
    setCsv({ ...csv, rows });
  };

  const start = async () => {
    if (validCount === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setResult(null);
    setProgress({ done: 0, total: validCount, label: 'Starting' });
    try {
      const outcome = await runBatch(mapped, {
        includeManifest,
        useApi,
        jpegQuality: output.jpegQuality,
        jpegBackground: output.jpegBackground,
        signal: controller.signal,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      setResult(outcome);
      if (outcome.cancelled)
        toast.info(
          'Batch cancelled',
          `${outcome.generated} code${outcome.generated === 1 ? '' : 's'} were generated before cancelling.`,
        );
      else
        toast.success(
          `Generated ${outcome.generated} QR code${outcome.generated === 1 ? '' : 's'}`,
          outcome.failures.length ? `${outcome.failures.length} failed` : undefined,
        );
    } catch (error) {
      toast.error('Batch failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const running = progress !== null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Batch generation</h1>
        <p className="text-sm text-muted">
          Import a CSV, fix any invalid rows, and download every code as a ZIP. Everything runs in your
          browser.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'panel flex flex-col items-center justify-center gap-3 p-6 text-center',
            dragging && 'ring-2 ring-brand-500',
          )}
        >
          <FileSpreadsheet size={32} className="text-muted" strokeWidth={1.25} aria-hidden />
          <div>
            <p className="text-sm font-medium">
              {csv ? `${csv.fileName} · ${csv.rows.length} rows` : 'Drop a CSV file here'}
            </p>
            <p className="text-xs text-muted">
              Columns: name, type, format, size, preset, errorCorrection, data plus any field of the chosen
              type.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Choose CSV file"
            onChange={(e) => void loadFile(e.target.files?.[0])}
            data-testid="csv-input"
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={Upload} onClick={() => fileRef.current?.click()}>
              {csv ? 'Choose another CSV' : 'Choose CSV'}
            </Button>
            <Button
              variant="outline"
              icon={Download}
              onClick={() =>
                downloadText(exampleCsv(), 'edgeqr-batch-template.csv', 'text/csv;charset=utf-8')
              }
            >
              Download template
            </Button>
          </div>
        </div>

        <div className="panel flex flex-col gap-3 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Defaults for rows without a value
          </h2>
          <Select
            label="Content type"
            value={defaultType}
            onChange={(v) => setDefaultType(v as ContentType)}
            options={CONTENT_TYPES.map((t) => ({ value: t, label: CONTENT_REGISTRY[t].label }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Format"
              value={defaultFormat}
              onChange={(v) => setDefaultFormat(v as OutputFormat)}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPG' },
                { value: 'svg', label: 'SVG' },
              ]}
            />
            <Select
              label="Size"
              value={String(defaultSize)}
              onChange={(v) => setDefaultSize(Number(v))}
              options={OUTPUT_SIZE_PRESETS.map((s) => ({ value: String(s), label: `${s} px` }))}
            />
          </div>
          <Switch
            label="Include manifest.json"
            description="Lists every file with its QR version and error correction."
            checked={includeManifest}
            onChange={setIncludeManifest}
          />
          <Switch
            label="Render raster files via API"
            description="Sends each row to this deployment's Worker instead of rendering locally."
            checked={useApi}
            onChange={setUseApi}
          />
          {useApi ? (
            <Callout tone="warning">
              API processing transmits the row contents to your Worker. Leave this off to keep everything
              on-device.
            </Callout>
          ) : null}
          <p className="text-xs text-muted">Limit: {batchLimit} codes per batch (change in Settings).</p>
        </div>
      </div>

      {csv ? (
        <div className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">
              <CheckCircle2 size={12} aria-hidden /> {validCount} valid
            </Badge>
            {invalidCount > 0 ? (
              <Badge tone="danger">
                <XCircle size={12} aria-hidden /> {invalidCount} invalid
              </Badge>
            ) : null}
            {truncated > 0 ? (
              <Badge tone="warning">
                <AlertTriangle size={12} aria-hidden /> {truncated} rows beyond the limit are skipped
              </Badge>
            ) : null}
            <div className="ml-auto flex gap-2">
              {running ? (
                <Button variant="danger" icon={Square} onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={Play}
                  onClick={start}
                  disabled={validCount === 0}
                  data-testid="batch-start"
                >
                  Generate {validCount} code{validCount === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          </div>

          {progress ? (
            <div className="flex flex-col gap-1" role="status" aria-live="polite">
              <div className="flex justify-between text-xs text-muted">
                <span>{progress.label}</span>
                <span className="tabular-nums">
                  {progress.done} / {progress.total}
                </span>
              </div>
              <progress
                className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-surface-3 [&::-webkit-progress-value]:bg-brand-600 [&::-moz-progress-bar]:bg-brand-600"
                value={progress.done}
                max={progress.total}
                aria-label="Batch progress"
              />
            </div>
          ) : null}

          {result ? (
            <Callout tone={result.failures.length ? 'warning' : 'success'}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {result.generated} file{result.generated === 1 ? '' : 's'} ready
                  {result.failures.length ? `, ${result.failures.length} failed` : ''}
                  {result.cancelled ? ' (cancelled)' : ''}.
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  icon={Download}
                  onClick={() => downloadBlob(result.zip, 'edgeqr-batch.zip')}
                  disabled={result.generated === 0}
                  data-testid="batch-download"
                >
                  Download ZIP
                </Button>
              </div>
              {result.failures.length ? (
                <ul className="mt-2 list-disc pl-4">
                  {result.failures.slice(0, 10).map((f) => (
                    <li key={f.name}>
                      {f.name}: {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Callout>
          ) : null}

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-default scroll-thin">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-surface-3">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  {csv.headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapped.map((row, i) => {
                  const invalid = row.request === null;
                  const source = csv.rows[i] ?? {};
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'border-t border-default align-top',
                        invalid && 'bg-red-50/60 dark:bg-red-900/10',
                      )}
                    >
                      <td className="px-2 py-1.5 tabular-nums text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {invalid ? (
                          <div className="flex flex-col gap-0.5 text-red-700 dark:text-red-300">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <XCircle size={12} aria-hidden /> Invalid
                            </span>
                            {row.issues.map((issue) => (
                              <span key={issue}>{issue}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={12} aria-hidden /> Ready
                          </span>
                        )}
                      </td>
                      {csv.headers.map((h) => (
                        <td key={h} className="px-1 py-1">
                          {invalid ? (
                            <input
                              type="text"
                              value={source[h] ?? ''}
                              onChange={(e) => updateCell(i, h, e.target.value)}
                              aria-label={`Row ${i + 1} ${h}`}
                              className="field-input h-7 min-w-24 px-1.5 py-0.5 text-xs"
                            />
                          ) : (
                            <span className="block max-w-56 truncate px-1" title={source[h]}>
                              {source[h]}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

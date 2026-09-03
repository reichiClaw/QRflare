import { encodeQr } from '@shared/qr/encode';
import { renderSvg } from '@shared/render/svg';
import {
  FINDER_CENTER_SHAPES,
  FINDER_FRAME_SHAPES,
  MIN_MODULE_SCALE,
  MODULE_SHAPES,
  resolveStyle,
  type FinderCenterShape,
  type FinderFrameShape,
  type ModuleShape,
} from '@shared/style/schema';

import { cn } from '../../lib/cn';
import { useEditor } from '../../store/editor';
import { Slider, Switch } from '../ui/Field';
import { SectionTitle } from '../ui/Primitives';

const SAMPLE = encodeQr('FlareQR', { errorCorrection: 'L', boostErrorCorrection: false });

function thumbnail(patch: Record<string, unknown>): string {
  const style = resolveStyle({ foreground: '#0F172A', background: '#FFFFFF', ...patch });
  return renderSvg({ matrix: SAMPLE.matrix, marginModules: 1, style, size: 64 }).svg;
}

const LABELS: Record<string, string> = {
  square: 'Square',
  rounded: 'Rounded',
  dots: 'Dots',
  'extra-rounded': 'Extra rounded',
  diamond: 'Diamond',
  classy: 'Classy',
  'classy-rounded': 'Classy rounded',
  custom: 'Custom',
  circle: 'Circle',
};

const MODULE_THUMBS = Object.fromEntries(
  MODULE_SHAPES.map((s) => [s, thumbnail({ moduleShape: s })]),
) as Record<ModuleShape, string>;
const FRAME_THUMBS = Object.fromEntries(
  FINDER_FRAME_SHAPES.map((s) => [s, thumbnail({ finderFrameShape: s })]),
) as Record<FinderFrameShape, string>;
const CENTER_THUMBS = Object.fromEntries(
  FINDER_CENTER_SHAPES.map((s) => [s, thumbnail({ finderCenterShape: s })]),
) as Record<FinderCenterShape, string>;

function ShapeGrid<T extends string>({
  label,
  value,
  options,
  thumbs,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  thumbs: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={label}>
      <SectionTitle>{label}</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={opt === value}
            aria-label={LABELS[opt] ?? opt}
            title={LABELS[opt] ?? opt}
            onClick={() => onChange(opt)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors',
              opt === value
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                : 'border-default hover:border-strong',
            )}
          >
            <img
              src={`data:image/svg+xml;base64,${btoa(thumbs[opt])}`}
              alt=""
              width={40}
              height={40}
              className="rounded bg-white"
            />
            <span className="truncate text-[10px] text-muted">{LABELS[opt] ?? opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ShapeTab() {
  const style = useEditor((s) => s.style);
  const setStyle = useEditor((s) => s.setStyle);
  return (
    <div className="flex flex-col gap-5">
      <ShapeGrid
        label="Module style"
        value={style.moduleShape}
        options={MODULE_SHAPES}
        thumbs={MODULE_THUMBS}
        onChange={(moduleShape) => setStyle({ moduleShape }, 'shape')}
      />
      {style.moduleShape === 'custom' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
          <Slider
            label="Corner radius"
            min={0}
            max={0.5}
            step={0.05}
            value={style.customModule.cornerRadius}
            onChange={(cornerRadius) => setStyle({ customModule: { cornerRadius } }, 'custom-radius')}
            format={(v) => `${Math.round(v * 200)}%`}
            description="0 % is square, 100 % is a full circle."
          />
          <Switch
            label="Connect neighbouring modules"
            description="Merges adjacent modules into flowing blobs while keeping the matrix intact."
            checked={style.customModule.connected}
            onChange={(connected) => setStyle({ customModule: { connected } }, 'custom-connected')}
          />
        </div>
      ) : null}
      <Slider
        label="Module scale"
        min={MIN_MODULE_SCALE}
        max={1}
        step={0.01}
        value={style.moduleScale}
        onChange={(moduleScale) => setStyle({ moduleScale }, 'module-scale')}
        format={(v) => `${Math.round(v * 100)}%`}
        description="Shrinks each module inside its cell. Below ~85 % scanners struggle."
      />
      <ShapeGrid
        label="Finder frame"
        value={style.finderFrameShape}
        options={FINDER_FRAME_SHAPES}
        thumbs={FRAME_THUMBS}
        onChange={(finderFrameShape) => setStyle({ finderFrameShape }, 'finder-frame')}
      />
      <ShapeGrid
        label="Finder center"
        value={style.finderCenterShape}
        options={FINDER_CENTER_SHAPES}
        thumbs={CENTER_THUMBS}
        onChange={(finderCenterShape) => setStyle({ finderCenterShape }, 'finder-center')}
      />
    </div>
  );
}

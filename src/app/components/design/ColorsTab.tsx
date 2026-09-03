import { Plus, RotateCcw, Trash2 } from 'lucide-react';

import { contrastRatio } from '@shared/style/color';
import { DEFAULT_STYLE } from '@shared/style/schema';

import { useEditor } from '../../store/editor';
import { Button } from '../ui/Button';
import { ColorInput, Segmented, Slider, Switch } from '../ui/Field';
import { Badge, SectionTitle } from '../ui/Primitives';

export function ColorsTab() {
  const style = useEditor((s) => s.style);
  const setStyle = useEditor((s) => s.setStyle);
  const g = style.gradient;
  const contrast = style.transparentBackground ? null : contrastRatio(style.foreground, style.background);

  const resetColors = () =>
    setStyle(
      {
        foreground: DEFAULT_STYLE.foreground,
        background: DEFAULT_STYLE.background,
        transparentBackground: false,
        finderColors: DEFAULT_STYLE.finderColors,
        gradient: DEFAULT_STYLE.gradient,
      },
      'reset-colors',
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionTitle
          action={
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={resetColors}>
              Reset
            </Button>
          }
        >
          Colours
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorInput
            label="Foreground"
            value={style.foreground}
            onChange={(foreground) => setStyle({ foreground }, 'fg')}
          />
          <ColorInput
            label="Background"
            value={style.background}
            onChange={(background) => setStyle({ background }, 'bg')}
            disabled={style.transparentBackground}
          />
        </div>
        <Switch
          label="Transparent background"
          description="PNG and SVG keep transparency; JPEG is flattened."
          checked={style.transparentBackground}
          onChange={(transparentBackground) => setStyle({ transparentBackground }, 'transparent')}
        />
        {contrast !== null ? (
          <p className="text-xs text-muted">
            Contrast {contrast.toFixed(1)}:1{' '}
            {contrast >= 4 ? (
              <Badge tone="success">good</Badge>
            ) : contrast >= 2.5 ? (
              <Badge tone="warning">low</Badge>
            ) : (
              <Badge tone="danger">too low</Badge>
            )}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Finder patterns</SectionTitle>
        <Switch
          label="Separate finder colours"
          checked={style.finderColors.enabled}
          onChange={(enabled) => setStyle({ finderColors: { enabled } }, 'finder-colors')}
        />
        {style.finderColors.enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorInput
              label="Finder frame"
              value={style.finderColors.frame}
              onChange={(frame) => setStyle({ finderColors: { frame } }, 'finder-frame-color')}
            />
            <ColorInput
              label="Finder center"
              value={style.finderColors.center}
              onChange={(center) => setStyle({ finderColors: { center } }, 'finder-center-color')}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Gradient</SectionTitle>
        <Switch
          label="Use a gradient"
          description="Keep every stop dark for reliable scans."
          checked={g.enabled}
          onChange={(enabled) => setStyle({ gradient: { enabled } }, 'gradient')}
        />
        {g.enabled ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Segmented
              label="Type"
              value={g.type}
              onChange={(type) => setStyle({ gradient: { type } }, 'gradient-type')}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' },
              ]}
            />
            {g.type === 'linear' ? (
              <Slider
                label="Angle"
                min={0}
                max={360}
                step={5}
                value={g.angle}
                onChange={(angle) => setStyle({ gradient: { angle } }, 'gradient-angle')}
                format={(v) => `${v}°`}
              />
            ) : null}
            <Segmented
              label="Apply to"
              value={g.target}
              onChange={(target) => setStyle({ gradient: { target } }, 'gradient-target')}
              options={[
                { value: 'all', label: 'Modules + finders' },
                { value: 'modules', label: 'Modules only' },
              ]}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Colour stops</span>
              {g.stops.map((stop, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                  <ColorInput
                    label={`Stop ${i + 1}`}
                    value={stop.color}
                    onChange={(color) =>
                      setStyle(
                        { gradient: { stops: g.stops.map((s, j) => (j === i ? { ...s, color } : s)) } },
                        `stop-${i}`,
                      )
                    }
                  />
                  <div className="w-24">
                    <Slider
                      label="Offset"
                      min={0}
                      max={1}
                      step={0.05}
                      value={stop.offset}
                      onChange={(offset) =>
                        setStyle(
                          { gradient: { stops: g.stops.map((s, j) => (j === i ? { ...s, offset } : s)) } },
                          `stop-offset-${i}`,
                        )
                      }
                      format={(v) => `${Math.round(v * 100)}%`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={Trash2}
                    aria-label={`Remove stop ${i + 1}`}
                    disabled={g.stops.length <= 2}
                    onClick={() =>
                      setStyle({ gradient: { stops: g.stops.filter((_, j) => j !== i) } }, 'stop-remove')
                    }
                  />
                </div>
              ))}
              {g.stops.length < 6 ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={Plus}
                  className="self-start"
                  onClick={() =>
                    setStyle(
                      { gradient: { stops: [...g.stops, { offset: 1, color: style.foreground }] } },
                      'stop-add',
                    )
                  }
                >
                  Add stop
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

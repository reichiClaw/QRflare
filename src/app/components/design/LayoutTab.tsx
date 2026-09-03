import { MAX_MARGIN_MODULES } from '@shared/qr/encode';

import { useEditor } from '../../store/editor';
import { ColorInput, Segmented, Select, Slider, Switch, TextInput } from '../ui/Field';
import { Callout, SectionTitle } from '../ui/Primitives';

export function LayoutTab() {
  const layout = useEditor((s) => s.style.layout);
  const qr = useEditor((s) => s.qr);
  const setStyle = useEditor((s) => s.setStyle);
  const setQr = useEditor((s) => s.setQr);
  const caption = layout.caption;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionTitle>Spacing</SectionTitle>
        <Slider
          label="Quiet zone"
          min={0}
          max={MAX_MARGIN_MODULES}
          value={qr.marginModules}
          onChange={(marginModules) => setQr({ marginModules })}
          format={(v) => `${v} modules`}
          description="Blank margin around the code. The standard requires 4 modules."
        />
        {qr.marginModules < 4 ? (
          <Callout tone="warning">Quiet zones below 4 modules reduce scan reliability.</Callout>
        ) : null}
        <Slider
          label="Outer padding"
          min={0}
          max={300}
          step={4}
          value={layout.padding}
          onChange={(padding) => setStyle({ layout: { padding } }, 'padding')}
          format={(v) => `${v}`}
          description="Safe area around the complete design (design units, QR = 1000)."
        />
        <Slider
          label="Background corner radius"
          min={0}
          max={300}
          step={4}
          value={layout.cornerRadius}
          onChange={(cornerRadius) => setStyle({ layout: { cornerRadius } }, 'bg-radius')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Border</SectionTitle>
        <Switch
          label="Border"
          checked={layout.border.enabled}
          onChange={(enabled) => setStyle({ layout: { border: { enabled } } }, 'border')}
        />
        {layout.border.enabled ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Slider
              label="Thickness"
              min={1}
              max={80}
              value={layout.border.width}
              onChange={(width) => setStyle({ layout: { border: { width } } }, 'border-width')}
            />
            <Slider
              label="Corner radius"
              min={0}
              max={300}
              step={4}
              value={layout.border.radius}
              onChange={(radius) => setStyle({ layout: { border: { radius } } }, 'border-radius')}
            />
            <ColorInput
              label="Border colour"
              value={layout.border.color}
              onChange={(color) => setStyle({ layout: { border: { color } } }, 'border-color')}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Frame</SectionTitle>
        <Switch
          label="Frame"
          description="A coloured band around the code; the caption sits on the frame."
          checked={layout.frame.enabled}
          onChange={(enabled) => setStyle({ layout: { frame: { enabled } } }, 'frame')}
        />
        {layout.frame.enabled ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Slider
              label="Thickness"
              min={10}
              max={200}
              step={2}
              value={layout.frame.thickness}
              onChange={(thickness) => setStyle({ layout: { frame: { thickness } } }, 'frame-thickness')}
            />
            <Slider
              label="Corner radius"
              min={0}
              max={300}
              step={4}
              value={layout.frame.radius}
              onChange={(radius) => setStyle({ layout: { frame: { radius } } }, 'frame-radius')}
            />
            <ColorInput
              label="Frame colour"
              value={layout.frame.color}
              onChange={(color) => setStyle({ layout: { frame: { color } } }, 'frame-color')}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Caption</SectionTitle>
        <Switch
          label="Caption"
          description="Rendered with a bundled system-font stack; no web fonts are loaded."
          checked={caption.enabled}
          onChange={(enabled) => setStyle({ layout: { caption: { enabled } } }, 'caption')}
        />
        {caption.enabled ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <TextInput
              label="Text"
              value={caption.text}
              onChange={(text) => setStyle({ layout: { caption: { text } } }, 'caption-text')}
              maxLength={80}
              placeholder="Scan me"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Segmented
                label="Position"
                value={caption.position}
                onChange={(position) => setStyle({ layout: { caption: { position } } }, 'caption-pos')}
                options={[
                  { value: 'top', label: 'Above' },
                  { value: 'bottom', label: 'Below' },
                ]}
              />
              <Segmented
                label="Alignment"
                value={caption.align}
                onChange={(align) => setStyle({ layout: { caption: { align } } }, 'caption-align')}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </div>
            <Slider
              label="Font size"
              min={20}
              max={200}
              step={2}
              value={caption.fontSize}
              onChange={(fontSize) => setStyle({ layout: { caption: { fontSize } } }, 'caption-size')}
            />
            <Select
              label="Weight"
              value={String(caption.fontWeight)}
              onChange={(w) =>
                setStyle(
                  { layout: { caption: { fontWeight: Number(w) as 400 | 500 | 600 | 700 } } },
                  'caption-weight',
                )
              }
              options={[
                { value: '400', label: 'Regular' },
                { value: '500', label: 'Medium' },
                { value: '600', label: 'Semibold' },
                { value: '700', label: 'Bold' },
              ]}
            />
            <Slider
              label="Letter spacing"
              min={-5}
              max={30}
              step={0.5}
              value={caption.letterSpacing}
              onChange={(letterSpacing) =>
                setStyle({ layout: { caption: { letterSpacing } } }, 'caption-spacing')
              }
            />
            <Slider
              label="Gap to code"
              min={0}
              max={150}
              step={2}
              value={caption.gap}
              onChange={(gap) => setStyle({ layout: { caption: { gap } } }, 'caption-gap')}
            />
            <ColorInput
              label="Text colour"
              value={caption.color}
              onChange={(color) => setStyle({ layout: { caption: { color } } }, 'caption-color')}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

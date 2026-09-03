import { Image, LayoutTemplate, Palette, RotateCcw, Shapes, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { PrepareResult } from '@shared/pipeline';

import { useEditor } from '../../store/editor';
import { Button } from '../ui/Button';
import { ConfirmDialog, TabPanel, Tabs } from '../ui/Primitives';
import { ColorsTab } from './ColorsTab';
import { LayoutTab } from './LayoutTab';
import { LogoTab } from './LogoTab';
import { PresetsTab } from './PresetsTab';
import { QrTab } from './QrTab';
import { ShapeTab } from './ShapeTab';

type DesignTab = 'presets' | 'shapes' | 'colors' | 'logo' | 'layout' | 'qr';

const TABS = [
  { id: 'presets' as const, label: 'Presets', icon: <Sparkles size={14} aria-hidden /> },
  { id: 'shapes' as const, label: 'Shapes', icon: <Shapes size={14} aria-hidden /> },
  { id: 'colors' as const, label: 'Colours', icon: <Palette size={14} aria-hidden /> },
  { id: 'logo' as const, label: 'Logo', icon: <Image size={14} aria-hidden /> },
  { id: 'layout' as const, label: 'Layout', icon: <LayoutTemplate size={14} aria-hidden /> },
  { id: 'qr' as const, label: 'QR', icon: <SlidersHorizontal size={14} aria-hidden /> },
];

export function DesignPanel({ result }: { result: PrepareResult | null }) {
  const [tab, setTab] = useState<DesignTab>('shapes');
  const resetStyle = useEditor((s) => s.resetStyle);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex flex-col gap-3" data-testid="design-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">2. Design</h2>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={() => setConfirm(true)}
          aria-label="Reset style"
        >
          Reset style
        </Button>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Design sections" size="sm" />
      <TabPanel id="presets" active={tab === 'presets'}>
        <PresetsTab />
      </TabPanel>
      <TabPanel id="shapes" active={tab === 'shapes'}>
        <ShapeTab />
      </TabPanel>
      <TabPanel id="colors" active={tab === 'colors'}>
        <ColorsTab />
      </TabPanel>
      <TabPanel id="logo" active={tab === 'logo'}>
        <LogoTab result={result} />
      </TabPanel>
      <TabPanel id="layout" active={tab === 'layout'}>
        <LayoutTab />
      </TabPanel>
      <TabPanel id="qr" active={tab === 'qr'}>
        <QrTab result={result} />
      </TabPanel>
      <ConfirmDialog
        open={confirm}
        title="Reset the design?"
        description="Shapes, colours, logo, layout and QR options return to their defaults. You can undo afterwards."
        confirmLabel="Reset design"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          resetStyle();
          setConfirm(false);
        }}
      />
    </div>
  );
}

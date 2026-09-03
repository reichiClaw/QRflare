import type { PrepareResult } from '@shared/pipeline';
import { byteModeCapacity, ERROR_CORRECTION_LEVELS, MAX_VERSION } from '@shared/qr/encode';
import { EC_RECOVERY } from '@shared/quality/reliability';

import { useEditor } from '../../store/editor';
import { Segmented, Select, Switch } from '../ui/Field';
import { Callout, Collapsible, SectionTitle } from '../ui/Primitives';

export function QrTab({ result }: { result: PrepareResult | null }) {
  const qr = useEditor((s) => s.qr);
  const setQr = useEditor((s) => s.setQr);
  const encode = result?.ok ? result.encode : null;

  const versionOptions = [
    { value: 'auto', label: 'Automatic (smallest that fits)' },
    ...Array.from({ length: MAX_VERSION }, (_, i) => i + 1).map((v) => ({
      value: String(v),
      label: `Version ${v} · ${v * 4 + 17}×${v * 4 + 17} · ≤ ${byteModeCapacity(v, qr.errorCorrection)} bytes`,
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionTitle>Error correction</SectionTitle>
        <Segmented
          label="Level"
          value={qr.errorCorrection}
          onChange={(errorCorrection) => setQr({ errorCorrection })}
          options={ERROR_CORRECTION_LEVELS.map((l) => ({
            value: l,
            label: `${l} · ${Math.round(EC_RECOVERY[l] * 100)}%`,
            title: `Recovers up to ${Math.round(EC_RECOVERY[l] * 100)} % damaged modules`,
          }))}
        />
        <p className="text-xs text-muted">
          Higher levels survive damage and logos but create denser codes. H is recommended when using a logo.
        </p>
        <Switch
          label="Boost error correction when free"
          description="Uses a higher level when it fits in the same version at no cost."
          checked={qr.boostErrorCorrection}
          onChange={(boostErrorCorrection) => setQr({ boostErrorCorrection })}
        />
        {encode && encode.errorCorrection !== encode.requestedErrorCorrection ? (
          <Callout tone="info">
            Level {encode.requestedErrorCorrection} was boosted to {encode.errorCorrection} for free.
          </Callout>
        ) : null}
      </div>

      <Collapsible title="Expert settings">
        <div className="flex flex-col gap-3">
          <Select
            label="QR version"
            value={String(qr.version)}
            onChange={(v) => setQr({ version: v === 'auto' ? 'auto' : Number(v) })}
            options={versionOptions}
            description="Forces a fixed symbol size. Content that does not fit is rejected."
          />
          <Select
            label="Mask pattern"
            value={String(qr.mask)}
            onChange={(m) =>
              setQr({ mask: m === 'auto' ? 'auto' : (Number(m) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) })
            }
            options={[
              { value: 'auto', label: 'Automatic (lowest penalty)' },
              ...[0, 1, 2, 3, 4, 5, 6, 7].map((m) => ({ value: String(m), label: `Mask ${m}` })),
            ]}
            description="Manual masks change the visual pattern but may reduce readability."
          />
          {encode ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface-3 p-3 text-xs">
              <dt className="text-muted">Version used</dt>
              <dd className="tabular-nums">{encode.version}</dd>
              <dt className="text-muted">Mask used</dt>
              <dd className="tabular-nums">{encode.mask}</dd>
              <dt className="text-muted">Data bits</dt>
              <dd className="tabular-nums">
                {encode.dataBits} / {encode.capacityBits}
              </dd>
              <dt className="text-muted">Segments</dt>
              <dd>{encode.segments.map((s) => `${s.mode}(${s.numChars})`).join(' + ')}</dd>
            </dl>
          ) : null}
        </div>
      </Collapsible>
    </div>
  );
}

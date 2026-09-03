import { useHistory } from '../../store/history';
import { useSettings, type ThemeMode } from '../../store/settings';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { NumberInput, Segmented, Switch } from '../ui/Field';
import { Callout, Dialog, SectionTitle } from '../ui/Primitives';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const clearHistory = useHistory((s) => s.clear);
  const historyCount = useHistory((s) => s.entries.length);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Preferences are stored in this browser only."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <SectionTitle>Appearance</SectionTitle>
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme: ThemeMode) => settings.update({ theme })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
          <Switch
            label="Expand raw payload by default"
            checked={settings.showRawPayload}
            onChange={(showRawPayload) => settings.update({ showRawPayload })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>Privacy</SectionTitle>
          <Switch
            label="Keep a local generation history"
            description="Saves your recent designs (including the encoded content) in this browser so you can restore them."
            checked={settings.historyEnabled}
            onChange={(historyEnabled) => settings.update({ historyEnabled })}
          />
          <Callout tone={settings.historyEnabled ? 'warning' : 'info'}>
            {settings.historyEnabled
              ? 'History may contain sensitive data such as Wi-Fi passwords, contact details or 2FA secrets. It never leaves this device, but anyone using this browser profile can see it.'
              : 'History is off. Nothing you generate is stored after you leave the page.'}
          </Callout>
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {historyCount} saved entr{historyCount === 1 ? 'y' : 'ies'}
            </span>
            <Button
              size="sm"
              variant="danger"
              disabled={historyCount === 0}
              onClick={() => {
                clearHistory();
                toast.success('History cleared');
              }}
            >
              Clear history now
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionTitle>Batch</SectionTitle>
          <NumberInput
            label="Maximum codes per batch"
            value={settings.batchLimit}
            onChange={(batchLimit) => settings.update({ batchLimit })}
            min={1}
            max={2000}
            inline
            description="Large batches take longer and use more memory."
          />
        </div>
      </div>
    </Dialog>
  );
}

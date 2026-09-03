import { CheckCircle2, ExternalLink, PlugZap, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_SETTINGS, type AppSettings, type DynamicProvider } from '@shared/settings/schema';

import { apiFetch, ApiRequestError, useServer } from '../../store/server';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { NumberInput, Segmented, Switch, TextArea, TextInput } from '../ui/Field';
import { Callout, SectionTitle } from '../ui/Primitives';

type Redacted = AppSettings & { secrets: { apiToken: boolean; sinkToken: boolean } };

interface SettingsResponse {
  settings: Redacted;
  env: { adminPasswordFromEnv: boolean; apiTokenFromEnv: boolean; corsFromEnv: string[]; storage: boolean };
}

function randomToken(length = 32): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function SettingsForm() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiToken, setApiToken] = useState('');
  const [sinkToken, setSinkToken] = useState('');
  const [clearApiToken, setClearApiToken] = useState(false);
  const [corsText, setCorsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refreshServer = useServer((s) => s.refresh);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<SettingsResponse>('/api/admin/settings');
      setData(response);
      setDraft(response.settings);
      setCorsText(response.settings.api.corsAllowedOrigins.join('\n'));
      setApiToken('');
      setSinkToken('');
      setClearApiToken(false);
    } catch (error) {
      toast.error('Could not load settings', error instanceof Error ? error.message : undefined);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load; state is set after the request resolves
    void load();
  }, [load]);

  const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...value } }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const corsAllowedOrigins = corsText
        .split(/[\n,]/)
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter(Boolean);
      const body = {
        settings: {
          ...draft,
          api: { ...draft.api, corsAllowedOrigins, token: apiToken },
          dynamic: { ...draft.dynamic, sink: { ...draft.dynamic.sink, token: sinkToken } },
        },
        clearApiToken,
        clearSinkToken: false,
      };
      delete (body.settings as Partial<Redacted>).secrets;
      const response = await apiFetch<{ settings: Redacted }>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setData((d) => (d ? { ...d, settings: response.settings } : d));
      setDraft(response.settings);
      setApiToken('');
      setSinkToken('');
      setClearApiToken(false);
      toast.success('Settings saved');
      void refreshServer();
    } catch (error) {
      if (error instanceof ApiRequestError && error.issues.length) {
        setErrors(Object.fromEntries(error.issues.map((i) => [i.path, i.message])));
        toast.error('Some settings are invalid', error.issues[0]?.message);
      } else {
        toast.error('Could not save settings', error instanceof Error ? error.message : undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const testSink = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>('/api/admin/settings/test-sink', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: draft.dynamic.sink.baseUrl, token: sinkToken || undefined }),
      });
      toast.success('Sink connection works', result.message);
    } catch (error) {
      toast.error('Sink connection failed', error instanceof Error ? error.message : undefined);
    } finally {
      setTesting(false);
    }
  };

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-muted" role="status">
        Loading settings…
      </div>
    );
  }

  const provider = draft.dynamic.provider;
  const linkBase =
    provider === 'sink'
      ? draft.dynamic.sink.linkBaseUrl || draft.dynamic.sink.baseUrl || 'https://your-sink.example'
      : draft.dynamic.builtin.publicBaseUrl || origin;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!data.env.storage ? (
        <Callout tone="warning">
          No D1 database is bound: settings cannot be saved. They are read from environment variables only.
        </Callout>
      ) : null}

      <section className="panel flex flex-col gap-3 p-5">
        <SectionTitle>General</SectionTitle>
        <TextInput
          label="Application name"
          value={draft.general.appName}
          onChange={(appName) => patch('general', { appName })}
          maxLength={60}
          error={errors['general.appName']}
        />
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <SectionTitle>Dynamic links</SectionTitle>
        <p className="text-sm text-muted">
          Short links whose destination you can change after the QR code is printed. Pick where they should
          live.
        </p>
        <Segmented
          label="Provider"
          value={provider}
          onChange={(p: DynamicProvider) => patch('dynamic', { provider: p })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'builtin', label: 'Built-in (this Worker)' },
            { value: 'sink', label: 'Sink instance' },
          ]}
        />
        {provider === 'builtin' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Callout tone="info">
              Links are stored in this Worker&apos;s D1 database and served from{' '}
              <code>{origin}/r/&lt;code&gt;</code>. Only aggregate scan counts are kept – no IP addresses or
              fingerprints.
            </Callout>
            <TextInput
              label="Public link domain (optional)"
              value={draft.dynamic.builtin.publicBaseUrl}
              onChange={(publicBaseUrl) => patch('dynamic', { builtin: { publicBaseUrl } })}
              placeholder={origin}
              description="Use this when the Worker is reachable under a custom domain, e.g. https://qr.example.com. QR codes will encode that domain."
              error={errors['dynamic.builtin.publicBaseUrl']}
              autoCapitalize="off"
            />
          </div>
        ) : null}
        {provider === 'sink' ? (
          <div className="flex flex-col gap-3 rounded-lg border border-default p-3">
            <Callout tone="info">
              Links are created in your self-hosted{' '}
              <a
                href="https://github.com/miantiao-me/sink"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                Sink <ExternalLink size={10} aria-hidden />
              </a>{' '}
              instance through its API. Use the same value as Sink&apos;s <code>NUXT_SITE_TOKEN</code>.
            </Callout>
            <TextInput
              label="Sink URL"
              value={draft.dynamic.sink.baseUrl}
              onChange={(baseUrl) => patch('dynamic', { sink: { ...draft.dynamic.sink, baseUrl } })}
              placeholder="https://s.example.com"
              error={errors['dynamic.sink.baseUrl']}
              autoCapitalize="off"
              required
            />
            <TextInput
              label={
                data.settings.secrets.sinkToken
                  ? 'Sink site token (leave empty to keep the saved one)'
                  : 'Sink site token'
              }
              secret
              value={sinkToken}
              onChange={setSinkToken}
              placeholder={data.settings.secrets.sinkToken ? '••••••••  (saved)' : 'NUXT_SITE_TOKEN'}
              error={errors['dynamic.sink.token']}
              autoComplete="off"
            />
            <TextInput
              label="Short link domain (optional)"
              value={draft.dynamic.sink.linkBaseUrl}
              onChange={(linkBaseUrl) => patch('dynamic', { sink: { ...draft.dynamic.sink, linkBaseUrl } })}
              placeholder={draft.dynamic.sink.baseUrl || 'https://go.example.com'}
              description="If your short links are served from a different domain than the Sink dashboard, enter it here. QR codes encode this domain."
              error={errors['dynamic.sink.linkBaseUrl']}
              autoCapitalize="off"
            />
            <div>
              <Button
                variant="outline"
                icon={PlugZap}
                onClick={testSink}
                loading={testing}
                disabled={!draft.dynamic.sink.baseUrl || (!sinkToken && !data.settings.secrets.sinkToken)}
              >
                Test connection
              </Button>
            </div>
          </div>
        ) : null}
        {provider !== 'off' ? (
          <>
            <p className="text-xs text-muted">
              Generated short links look like{' '}
              <code className="rounded bg-surface-3 px-1">
                {linkBase}/{provider === 'builtin' ? 'r/' : ''}abc123
              </code>
              .
            </p>
            <Switch
              label="Let anyone manage dynamic links"
              description="Off (recommended): only logged-in admins can create, edit or delete links. On: the Links page works without a password."
              checked={draft.dynamic.publicAccess}
              onChange={(publicAccess) => patch('dynamic', { publicAccess })}
            />
          </>
        ) : null}
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <SectionTitle>HTTP API</SectionTitle>
        <Switch
          label="Require a bearer token for the API"
          description="Protects /api/v1/* against third-party use. The bundled web app keeps working without a token."
          checked={draft.api.requireToken}
          onChange={(requireToken) => patch('api', { requireToken })}
        />
        {draft.api.requireToken ? (
          <div className="flex flex-col gap-2 rounded-lg border border-default p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextInput
                  label={
                    data.settings.secrets.apiToken && !clearApiToken
                      ? 'API token (leave empty to keep the saved one)'
                      : 'API token'
                  }
                  secret
                  value={apiToken}
                  onChange={(v) => {
                    setApiToken(v);
                    setClearApiToken(false);
                  }}
                  placeholder={
                    data.settings.secrets.apiToken ? '••••••••  (saved)' : 'at least 16 characters'
                  }
                  error={errors['api.token']}
                  autoComplete="off"
                />
              </div>
              <Button variant="outline" icon={RefreshCw} onClick={() => setApiToken(randomToken())}>
                Generate
              </Button>
            </div>
            {data.env.apiTokenFromEnv ? (
              <p className="text-xs text-muted">
                A token from the API_TOKEN variable is active; saving a token here overrides it.
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Clients send <code>Authorization: Bearer &lt;token&gt;</code>. Copy the token now – it is not
              shown again after saving.
            </p>
          </div>
        ) : null}
        <TextArea
          label="Allowed cross-origin sites (CORS)"
          value={corsText}
          onChange={setCorsText}
          rows={3}
          placeholder={'https://app.example.com\nhttps://intranet.example.com'}
          description="One origin per line. Leave empty to allow only same-origin calls (no wildcard is ever used)."
          error={Object.entries(errors).find(([k]) => k.startsWith('api.corsAllowedOrigins'))?.[1]}
          mono
        />
        <NumberInput
          label="Maximum raster width rendered by the API (px)"
          value={draft.api.maxRasterSize}
          onChange={(maxRasterSize) => patch('api', { maxRasterSize })}
          min={128}
          max={8192}
          inline
          description="Large renders can exceed the CPU limit of the Workers Free plan."
          error={errors['api.maxRasterSize']}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          icon={Save}
          loading={saving}
          disabled={!data.env.storage}
        >
          Save settings
        </Button>
        <Button variant="ghost" onClick={load}>
          Discard changes
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <CheckCircle2 size={12} aria-hidden /> Changes apply within a few seconds.
        </span>
      </div>
    </form>
  );
}

/**
 * Dynamic links management. Works with both providers (built-in D1 or Sink)
 * through the unified /api/v1/links API. Requires an admin session unless the
 * administrator enabled public access in the settings.
 */
import { BarChart3, ExternalLink, Link2, Lock, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useEditor } from '../../store/editor';
import { apiFetch, ApiRequestError, useServer } from '../../store/server';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { NumberInput, Switch, TextInput } from '../ui/Field';
import { Badge, Callout, ConfirmDialog } from '../ui/Primitives';

interface DynamicLink {
  code: string;
  shortUrl: string;
  destination: string;
  label: string | null;
  enabled: boolean;
  expiresAt: string | null;
  maxScans: number | null;
  scanCount: number | null;
  createdAt: string | null;
  provider: 'builtin' | 'sink';
  statsUrl: string | null;
}

export function LinksView({
  onUseInStudio,
  embedded = false,
  onGoToAdmin,
}: {
  onUseInStudio: () => void;
  embedded?: boolean;
  onGoToAdmin?: () => void;
}) {
  const features = useServer((s) => s.features);
  const sessionToken = useServer((s) => s.sessionToken);
  const loadSnapshot = useEditor((s) => s.loadSnapshot);
  const [links, setLinks] = useState<DynamicLink[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [maxScans, setMaxScans] = useState(0);
  const [deleting, setDeleting] = useState<DynamicLink | null>(null);
  const [draftDestinations, setDraftDestinations] = useState<Record<string, string>>({});

  const provider = features.dynamicLinks.provider;
  const canAccess = features.dynamicLinks.publicAccess || Boolean(sessionToken);

  const refresh = useCallback(async () => {
    if (provider === 'off' || !canAccess) return;
    setLoading(true);
    try {
      const body = await apiFetch<{ links: DynamicLink[] }>('/api/v1/links');
      setLinks(body.links);
      setDenied(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) setDenied(true);
      else toast.error('Could not load links', error instanceof Error ? error.message : undefined);
      setLinks(null);
    } finally {
      setLoading(false);
    }
  }, [provider, canAccess]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load; state is set after the request resolves
    void refresh();
  }, [refresh]);

  const create = async () => {
    try {
      const body = await apiFetch<{ link: DynamicLink }>('/api/v1/links', {
        method: 'POST',
        body: JSON.stringify({
          destination,
          code: code.trim() || undefined,
          label: label || undefined,
          expiresAt: expires ? new Date(expires).toISOString() : undefined,
          maxScans: provider === 'builtin' && maxScans > 0 ? maxScans : undefined,
        }),
      });
      toast.success('Link created', body.link.shortUrl);
      setDestination('');
      setCode('');
      setLabel('');
      setExpires('');
      setMaxScans(0);
      await refresh();
    } catch (error) {
      toast.error(
        'Could not create link',
        error instanceof ApiRequestError ? (error.issues[0]?.message ?? error.message) : undefined,
      );
    }
  };

  const patch = async (link: DynamicLink, changes: Record<string, unknown>) => {
    try {
      await apiFetch(`/api/v1/links/${encodeURIComponent(link.code)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      toast.success('Link updated');
      await refresh();
    } catch (error) {
      toast.error('Update failed', error instanceof Error ? error.message : undefined);
    }
  };

  const openInStudio = (link: DynamicLink) => {
    loadSnapshot({ content: { type: 'url', value: { url: link.shortUrl, autoHttps: true } } });
    toast.success('Short link loaded into the studio', link.shortUrl);
    onUseInStudio();
  };

  if (provider === 'off') {
    return (
      <Callout tone="info">
        Dynamic links are switched off.{' '}
        {embedded
          ? 'Enable them in the Settings tab.'
          : 'An administrator can enable them under Admin → Settings.'}
      </Callout>
    );
  }

  if (!canAccess || denied) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-dashed border-strong p-8 text-center">
        <Lock size={28} className="text-muted" aria-hidden />
        <p className="text-sm text-muted">Managing dynamic links requires the admin password.</p>
        {onGoToAdmin ? (
          <Button variant="primary" onClick={onGoToAdmin}>
            Go to Admin login
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={embedded ? 'flex flex-col gap-4' : 'mx-auto flex w-full max-w-4xl flex-col gap-4'}>
      {!embedded ? (
        <div>
          <h1 className="text-lg font-semibold">Dynamic links</h1>
          <p className="text-sm text-muted">
            Short URLs whose destination can change without reprinting the QR code.
          </p>
        </div>
      ) : null}

      <Callout tone="info">
        {provider === 'sink' ? (
          <>
            Links are managed in your Sink instance. Short links use{' '}
            <code>{features.dynamicLinks.linkBaseUrl}/&lt;slug&gt;</code>.
          </>
        ) : (
          <>
            Links are served by this Worker as <code>{features.dynamicLinks.linkBaseUrl}/r/&lt;code&gt;</code>
            . Only aggregate scan counts are stored.
          </>
        )}
      </Callout>

      <form
        className="panel flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Create a link</h2>
        <TextInput
          label="Destination URL"
          type="url"
          value={destination}
          onChange={setDestination}
          placeholder="https://example.com/campaign"
          required
          autoCapitalize="off"
        />
        <div className={`grid gap-3 ${provider === 'builtin' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <TextInput
            label={provider === 'sink' ? 'Slug (optional)' : 'Code (optional)'}
            value={code}
            onChange={setCode}
            placeholder="auto"
            autoCapitalize="off"
            description="Letters, digits, - and _"
          />
          <TextInput
            label={provider === 'sink' ? 'Comment (optional)' : 'Label (optional)'}
            value={label}
            onChange={setLabel}
          />
          <TextInput label="Expires (optional)" type="datetime-local" value={expires} onChange={setExpires} />
          {provider === 'builtin' ? (
            <NumberInput label="Max scans (0 = unlimited)" value={maxScans} onChange={setMaxScans} min={0} />
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" icon={Plus} disabled={!destination}>
            Create link
          </Button>
          <Button variant="ghost" icon={RefreshCw} onClick={refresh} loading={loading}>
            Refresh
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {links && links.length === 0 ? <Callout tone="info">No links yet.</Callout> : null}
        {links?.map((link) => (
          <div key={link.code} className="panel flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 size={16} className="text-brand-600" aria-hidden />
              <code className="text-sm font-semibold">{link.shortUrl}</code>
              <Badge tone={link.enabled ? 'success' : 'neutral'}>
                {link.enabled ? 'active' : 'inactive'}
              </Badge>
              {link.scanCount !== null ? <Badge tone="info">{link.scanCount} scans</Badge> : null}
              {link.label ? <Badge>{link.label}</Badge> : null}
              <div className="ml-auto flex gap-1">
                <Button size="sm" icon={QrCode} onClick={() => openInStudio(link)}>
                  Use in studio
                </Button>
                {link.statsUrl ? (
                  <a
                    href={link.statsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-strong px-2.5 text-xs font-medium hover:bg-surface-3"
                  >
                    <BarChart3 size={14} aria-hidden /> Stats
                  </a>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Delete ${link.code}`}
                  onClick={() => setDeleting(link)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextInput
                label="Destination"
                type="url"
                value={draftDestinations[link.code] ?? link.destination}
                onChange={(value) => setDraftDestinations((d) => ({ ...d, [link.code]: value }))}
                onBlur={() => {
                  const next = draftDestinations[link.code];
                  if (next !== undefined && next !== link.destination)
                    void patch(link, { destination: next });
                }}
                autoCapitalize="off"
              />
              {link.provider === 'builtin' ? (
                <Switch
                  label="Enabled"
                  checked={link.enabled}
                  onChange={(enabled) => void patch(link, { enabled })}
                />
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {link.createdAt ? `Created ${new Date(link.createdAt).toLocaleString()}` : ''}
              {link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleString()}` : ''}
              {link.maxScans ? ` · max ${link.maxScans} scans` : ''}{' '}
              <a
                href={link.destination}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                open destination <ExternalLink size={10} aria-hidden />
              </a>
            </p>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.code ?? ''}?`}
        description="Printed QR codes pointing to this link will stop working."
        confirmLabel="Delete link"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await apiFetch(`/api/v1/links/${encodeURIComponent(deleting.code)}`, { method: 'DELETE' });
            toast.success('Link deleted');
            await refresh();
          } catch (error) {
            toast.error('Delete failed', error instanceof Error ? error.message : undefined);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

/**
 * Admin UI for the optional dynamic QR module. Only mounted when the deployment
 * reports `features.dynamicQr === true`. The admin token is kept in memory for
 * this tab only.
 */
import { ExternalLink, Link2, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useEditor } from '../../store/editor';
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
  scanCount: number;
  createdAt: string;
}

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/dynamic${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; issues?: Array<{ message: string }> };
  } & T;
  if (!response.ok)
    throw new Error(
      body.error?.issues?.[0]?.message ?? body.error?.message ?? `Request failed (${response.status})`,
    );
  return body;
}

export default function DynamicView({ onUseInStudio }: { onUseInStudio: () => void }) {
  const [token, setToken] = useState('');
  const [links, setLinks] = useState<DynamicLink[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState('');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [maxScans, setMaxScans] = useState(0);
  const [deleting, setDeleting] = useState<DynamicLink | null>(null);
  const loadSnapshot = useEditor((s) => s.loadSnapshot);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const body = await api<{ links: DynamicLink[] }>('/links', token);
      setLinks(body.links);
    } catch (error) {
      toast.error('Could not load links', error instanceof Error ? error.message : undefined);
      setLinks(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const create = async () => {
    try {
      const body = await api<{ link: DynamicLink }>('/links', token, {
        method: 'POST',
        body: JSON.stringify({
          destination,
          label: label || undefined,
          expiresAt: expires ? new Date(expires).toISOString() : undefined,
          maxScans: maxScans > 0 ? maxScans : undefined,
        }),
      });
      toast.success('Link created', body.link.shortUrl);
      setDestination('');
      setLabel('');
      setExpires('');
      setMaxScans(0);
      await refresh();
    } catch (error) {
      toast.error('Could not create link', error instanceof Error ? error.message : undefined);
    }
  };

  const patch = async (link: DynamicLink, changes: Record<string, unknown>) => {
    try {
      await api(`/links/${link.code}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
      await refresh();
    } catch (error) {
      toast.error('Update failed', error instanceof Error ? error.message : undefined);
    }
  };

  const loadIntoStudio = (link: DynamicLink) => {
    loadSnapshot({ content: { type: 'url', value: { url: link.shortUrl, autoHttps: true } } });
    toast.success('Short link loaded into the studio');
    onUseInStudio();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Dynamic links</h1>
        <p className="text-sm text-muted">
          Short redirect URLs whose destination can change without reprinting the QR code. Only aggregate scan
          counts are stored.
        </p>
      </div>

      <div className="panel flex flex-col gap-3 p-4">
        <TextInput
          label="Admin token"
          secret
          value={token}
          onChange={(next) => {
            setToken(next);
            setLinks(null);
          }}
          description="The DYNAMIC_ADMIN_TOKEN secret of this deployment. Kept in memory only."
          autoComplete="off"
        />
        <div>
          <Button icon={RefreshCw} onClick={refresh} disabled={!token} loading={loading}>
            Load links
          </Button>
        </div>
      </div>

      {links ? (
        <>
          <div className="panel flex flex-col gap-3 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Create a link</h2>
            <TextInput
              label="Destination URL"
              type="url"
              value={destination}
              onChange={setDestination}
              placeholder="https://example.com/campaign"
              required
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Label (optional)" value={label} onChange={setLabel} />
              <TextInput
                label="Expires (optional)"
                type="datetime-local"
                value={expires}
                onChange={setExpires}
              />
              <NumberInput
                label="Max scans (0 = unlimited)"
                value={maxScans}
                onChange={setMaxScans}
                min={0}
              />
            </div>
            <div>
              <Button variant="primary" icon={Plus} onClick={create} disabled={!destination}>
                Create link
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {links.length === 0 ? <Callout tone="info">No links yet.</Callout> : null}
            {links.map((link) => (
              <div key={link.code} className="panel flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 size={16} className="text-brand-600" aria-hidden />
                  <code className="text-sm font-semibold">{link.shortUrl}</code>
                  <Badge tone={link.enabled ? 'success' : 'neutral'}>
                    {link.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                  <Badge tone="info">{link.scanCount} scans</Badge>
                  {link.label ? <Badge>{link.label}</Badge> : null}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" icon={QrCode} onClick={() => loadIntoStudio(link)}>
                      Use in studio
                    </Button>
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
                    value={link.destination}
                    onChange={(destinationValue) =>
                      setLinks(
                        links.map((l) =>
                          l.code === link.code ? { ...l, destination: destinationValue } : l,
                        ),
                      )
                    }
                    onBlur={() => void patch(link, { destination: link.destination })}
                  />
                  <Switch
                    label="Enabled"
                    checked={link.enabled}
                    onChange={(enabled) => void patch(link, { enabled })}
                  />
                </div>
                <p className="text-xs text-muted">
                  Created {new Date(link.createdAt).toLocaleString()}
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
        </>
      ) : null}

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
            await api(`/links/${deleting.code}`, token, { method: 'DELETE' });
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

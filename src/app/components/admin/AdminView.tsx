/**
 * Password-protected Admin area: first-run password setup, login, settings,
 * dynamic links and password change. Everything else in the app stays public.
 */
import { KeyRound, Link2, LogOut, Settings2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch, ApiRequestError, useServer } from '../../store/server';
import { toast } from '../../store/toast';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Field';
import { Callout, TabPanel, Tabs } from '../ui/Primitives';
import { LinksView } from '../links/LinksView';
import { SettingsForm } from './SettingsForm';

interface AdminStatus {
  storage: boolean;
  adminAvailable: boolean;
  setupRequired: boolean;
  passwordSource: 'env' | 'stored' | 'none';
  authenticated: boolean;
}

type AdminTab = 'settings' | 'links' | 'password';

function SetupForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const setSession = useServer((s) => s.setSession);
  const submit = async () => {
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{ token: string }>('/api/admin/setup', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setSession(result.token);
      toast.success('Admin password created', 'You are now logged in.');
      onDone();
    } catch (error) {
      toast.error('Could not create password', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="panel mx-auto flex w-full max-w-md flex-col gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-brand-600" aria-hidden />
        <h1 className="text-lg font-semibold">Welcome – secure your admin area</h1>
      </div>
      <p className="text-sm text-muted">
        This deployment has no admin password yet. Choose one now; it protects the settings and dynamic links.
        Everything else stays public.
      </p>
      <TextInput
        label="Admin password"
        secret
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        description="At least 10 characters."
        required
      />
      <TextInput
        label="Repeat password"
        secret
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={busy}
        disabled={password.length < 10 || confirm.length === 0}
      >
        Create password and continue
      </Button>
      <Callout tone="info">
        Prefer configuration as code? Set the ADMIN_PASSWORD variable on the Worker instead; this screen then
        disappears.
      </Callout>
    </form>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const setSession = useServer((s) => s.setSession);
  const submit = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setSession(result.token);
      setPassword('');
      onDone();
    } catch (error) {
      toast.error('Login failed', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="panel mx-auto flex w-full max-w-md flex-col gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <KeyRound className="text-brand-600" aria-hidden />
        <h1 className="text-lg font-semibold">Admin login</h1>
      </div>
      <TextInput
        label="Password"
        secret
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
        autoFocus
      />
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!password}>
        Log in
      </Button>
    </form>
  );
}

function PasswordForm({ fromEnv }: { fromEnv: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  if (fromEnv) {
    return (
      <Callout tone="info">
        The admin password comes from the ADMIN_PASSWORD variable of this Worker. Change it in the Cloudflare
        dashboard or with `wrangler secret put ADMIN_PASSWORD`.
      </Callout>
    );
  }
  const submit = async () => {
    if (next !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (error) {
      toast.error('Could not change password', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextInput
        label="Current password"
        secret
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        required
      />
      <TextInput
        label="New password"
        secret
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        description="At least 10 characters."
        required
      />
      <TextInput
        label="Repeat new password"
        secret
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <div>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={!current || next.length < 10 || !confirm}
        >
          Change password
        </Button>
      </div>
    </form>
  );
}

export default function AdminView({ onUseInStudio }: { onUseInStudio: () => void }) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [tab, setTab] = useState<AdminTab>('settings');
  const sessionToken = useServer((s) => s.sessionToken);
  const setSession = useServer((s) => s.setSession);
  const refreshServer = useServer((s) => s.refresh);
  const features = useServer((s) => s.features);

  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<AdminStatus>('/api/admin/status'));
    } catch (error) {
      toast.error('Admin status unavailable', error instanceof ApiRequestError ? error.message : undefined);
      setStatus({
        storage: false,
        adminAvailable: false,
        setupRequired: false,
        passwordSource: 'none',
        authenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load; state is set after the request resolves
    void load();
  }, [load, sessionToken]);

  const afterAuth = () => {
    void load();
    void refreshServer();
  };

  if (!status) {
    return (
      <div className="py-20 text-center text-sm text-muted" role="status">
        Loading…
      </div>
    );
  }

  if (!status.adminAvailable && !status.setupRequired) {
    return (
      <div className="mx-auto max-w-2xl">
        <Callout tone="warning">
          <p className="font-medium">The Admin area is not available on this deployment.</p>
          <p className="mt-1">
            Settings and built-in dynamic links need the D1 database declared in <code>wrangler.jsonc</code>{' '}
            (it is created automatically by <code>npm run deploy</code> and the Deploy button). Alternatively
            set the <code>ADMIN_PASSWORD</code> variable to enable login without storage.
          </p>
        </Callout>
      </div>
    );
  }

  if (status.setupRequired) return <SetupForm onDone={afterAuth} />;
  if (!status.authenticated) return <LoginForm onDone={afterAuth} />;

  const tabs = [
    { id: 'settings' as const, label: 'Settings', icon: <Settings2 size={14} aria-hidden /> },
    { id: 'links' as const, label: 'Dynamic links', icon: <Link2 size={14} aria-hidden /> },
    { id: 'password' as const, label: 'Password', icon: <KeyRound size={14} aria-hidden /> },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="text-sm text-muted">
            Configure {features.appName}. Only this area requires a password.
          </p>
        </div>
        <Button
          variant="outline"
          icon={LogOut}
          onClick={() => {
            void apiFetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
            setSession(null);
            toast.info('Logged out');
          }}
        >
          Log out
        </Button>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Admin sections" />
      <TabPanel id="settings" active={tab === 'settings'}>
        <SettingsForm />
      </TabPanel>
      <TabPanel id="links" active={tab === 'links'}>
        <LinksView onUseInStudio={onUseInStudio} embedded />
      </TabPanel>
      <TabPanel id="password" active={tab === 'password'}>
        <div className="panel p-5">
          <PasswordForm fromEnv={status.passwordSource === 'env'} />
        </div>
      </TabPanel>
    </div>
  );
}

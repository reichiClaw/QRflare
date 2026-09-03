import { Download, FileText, Palette, ScanLine } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

import { useGeneration } from './hooks/useGeneration';
import { useIsDesktop } from './hooks/useMediaQuery';
import { useShortcuts, useUnsavedGuard } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { cn } from './lib/cn';
import { useEditor } from './store/editor';
import { useServer } from './store/server';
import { ContentPanel } from './components/content/ContentPanel';
import { DesignPanel } from './components/design/DesignPanel';
import { ExportPanel } from './components/export/ExportPanel';
import { Footer } from './components/layout/Footer';
import { Header, type AppView } from './components/layout/Header';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { ReliabilityPanel } from './components/preview/ReliabilityPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { HistoryView } from './components/history/HistoryView';
import { LinksView } from './components/links/LinksView';
import { Toaster } from './components/ui/Primitives';

const BatchView = lazy(() => import('./components/batch/BatchView'));
const AdminView = lazy(() => import('./components/admin/AdminView'));

type MobileTab = 'content' | 'preview' | 'design' | 'export';

const MOBILE_TABS: Array<{ id: MobileTab; label: string; icon: typeof FileText }> = [
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'preview', label: 'Preview', icon: ScanLine },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'export', label: 'Export', icon: Download },
];

function LoadingView() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-muted" role="status">
      Loading…
    </div>
  );
}

export function App() {
  useTheme();
  useShortcuts();
  const dirty = useEditor((s) => s.dirty);
  useUnsavedGuard(dirty);

  const [view, setView] = useState<AppView>('studio');
  const [mobileTab, setMobileTab] = useState<MobileTab>('content');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const refreshServer = useServer((s) => s.refresh);
  const appName = useServer((s) => s.features.appName);
  const generation = useGeneration();

  useEffect(() => {
    void refreshServer();
  }, [refreshServer]);

  useEffect(() => {
    document.title = `${appName} – Private QR code generator`;
  }, [appName]);

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-2 top-2 z-50 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"
      >
        Skip to content
      </a>
      <Header view={view} onViewChange={setView} onOpenSettings={() => setSettingsOpen(true)} />

      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-5" tabIndex={-1}>
        {view === 'studio' ? (
          isDesktop ? (
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)_380px] xl:grid-cols-[400px_minmax(0,1fr)_420px]">
              <aside
                className="panel max-h-[calc(100vh-7rem)] overflow-y-auto p-4 scroll-thin"
                aria-label="Content"
              >
                <ContentPanel result={generation.result} />
              </aside>
              <section className="flex flex-col gap-4" aria-label="Preview">
                <div className="panel flex flex-col items-center gap-4 p-5">
                  <PreviewPanel
                    result={generation.result}
                    previewUrl={generation.previewUrl}
                    pending={generation.pending}
                  />
                </div>
                <div className="panel p-4">
                  <ReliabilityPanel result={generation.result} />
                </div>
              </section>
              <aside
                className="flex max-h-[calc(100vh-7rem)] flex-col gap-4 overflow-y-auto scroll-thin"
                aria-label="Design and export"
              >
                <div className="panel p-4">
                  <DesignPanel result={generation.result} />
                </div>
                <div className="panel p-4">
                  <ExportPanel result={generation.result} />
                </div>
              </aside>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-24">
              {mobileTab !== 'preview' ? (
                <div className="panel sticky top-16 z-20 flex items-center gap-3 p-3">
                  <PreviewPanel
                    result={generation.result}
                    previewUrl={generation.previewUrl}
                    pending={generation.pending}
                    compact
                  />
                  <div className="min-w-0 flex-1 text-xs text-muted">
                    <p className="font-medium text-fg">Live preview</p>
                    <p>Generated locally on this device.</p>
                    {generation.result?.ok ? (
                      <p className="mt-1">
                        v{generation.result.encode.version} · {generation.result.encode.errorCorrection} ·{' '}
                        {generation.result.reliability.status}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="panel p-4">
                {mobileTab === 'content' ? <ContentPanel result={generation.result} /> : null}
                {mobileTab === 'preview' ? (
                  <div className="flex flex-col gap-4">
                    <PreviewPanel
                      result={generation.result}
                      previewUrl={generation.previewUrl}
                      pending={generation.pending}
                    />
                    <ReliabilityPanel result={generation.result} />
                  </div>
                ) : null}
                {mobileTab === 'design' ? <DesignPanel result={generation.result} /> : null}
                {mobileTab === 'export' ? <ExportPanel result={generation.result} /> : null}
              </div>
              <nav
                aria-label="Editor sections"
                className="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-surface-2/95 backdrop-blur"
              >
                <div className="mx-auto grid max-w-lg grid-cols-4">
                  {MOBILE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = tab.id === mobileTab;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMobileTab(tab.id)}
                        aria-current={active ? 'step' : undefined}
                        className={cn(
                          'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                          active ? 'text-brand-600 dark:text-brand-300' : 'text-muted',
                        )}
                        data-testid={`mobile-tab-${tab.id}`}
                      >
                        <Icon size={18} aria-hidden />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </nav>
            </div>
          )
        ) : null}

        {view === 'batch' ? (
          <Suspense fallback={<LoadingView />}>
            <BatchView />
          </Suspense>
        ) : null}
        {view === 'history' ? <HistoryView onRestore={() => setView('studio')} /> : null}
        {view === 'links' ? (
          <LinksView onUseInStudio={() => setView('studio')} onGoToAdmin={() => setView('admin')} />
        ) : null}
        {view === 'admin' ? (
          <Suspense fallback={<LoadingView />}>
            <AdminView onUseInStudio={() => setView('studio')} />
          </Suspense>
        ) : null}
      </main>

      <Footer />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
    </div>
  );
}

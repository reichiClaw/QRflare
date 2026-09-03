import { History, Layers, Monitor, Moon, QrCode, Redo2, Settings, Sun, Undo2 } from 'lucide-react';

import { branding } from '../../../config/branding';
import { cn } from '../../lib/cn';
import { selectCanRedo, selectCanUndo, useEditor } from '../../store/editor';
import { useSettings, type ThemeMode } from '../../store/settings';
import { Button } from '../ui/Button';

export type AppView = 'studio' | 'batch' | 'history' | 'dynamic';

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };

export function Header({
  view,
  onViewChange,
  onOpenSettings,
  dynamicAvailable,
}: {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onOpenSettings: () => void;
  dynamicAvailable: boolean;
}) {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const ThemeIcon = THEME_ICON[theme];

  const nav: Array<{ id: AppView; label: string; icon: typeof QrCode }> = [
    { id: 'studio', label: 'Studio', icon: QrCode },
    { id: 'batch', label: 'Batch', icon: Layers },
    { id: 'history', label: 'History', icon: History },
  ];
  if (dynamicAvailable) nav.push({ id: 'dynamic', label: 'Dynamic links', icon: Layers });

  return (
    <header className="sticky top-0 z-30 border-b border-default bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <a href="/" className="flex items-center gap-2 rounded-lg" aria-label={`${branding.name} home`}>
          <img src={branding.logoPath} alt="" width={28} height={28} className="rounded-md" />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">{branding.name}</span>
        </a>

        <nav aria-label="Primary" className="ml-2 flex items-center gap-1 rounded-xl bg-surface-3 p-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                  active
                    ? 'bg-surface-2 text-fg shadow-sm ring-1 ring-brand-500/40'
                    : 'text-muted hover:text-fg',
                )}
              >
                <Icon size={15} aria-hidden />
                <span className={cn(item.id !== 'studio' && 'hidden sm:inline')}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {view === 'studio' ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                icon={Undo2}
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo (Ctrl+Z)"
                title="Undo (Ctrl+Z)"
              />
              <Button
                variant="ghost"
                size="icon"
                icon={Redo2}
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo (Ctrl+Shift+Z)"
                title="Redo (Ctrl+Shift+Z)"
              />
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            icon={ThemeIcon}
            onClick={() =>
              update({
                theme: THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length] ?? 'system',
              })
            }
            aria-label={`${THEME_LABEL[theme]} – click to switch`}
            title={THEME_LABEL[theme]}
            data-testid="theme-toggle"
          />
          <Button
            variant="ghost"
            size="icon"
            icon={Settings}
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          />
        </div>
      </div>
    </header>
  );
}

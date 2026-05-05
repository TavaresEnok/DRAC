import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { StatusStrip } from '../components/StatusStrip';
import { CommandPalette } from '../components/CommandPalette';
import { AlarmToast } from '../components/AlarmToast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useThemeStore } from '../store/themeStore';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Command Center',
  '/live':         'Live View',
  '/playback':     'Playback',
  '/events':       'Events Log',
  '/alarms':       'Alarm Management',
  '/cameras':      'Camera Management',
  '/cameras/':     'Camera Detail',
  '/map':          'Map / Floorplan',
  '/ptz':          'PTZ Control',
  '/investigation':'Investigation Mode',
  '/evidence':     'Evidence Export',
  '/storage':      'Storage & Retention',
  '/settings':     'Settings',
  '/users':        'User Management',
  '/roles':        'Roles & Permissions',
  '/audit':        'Audit Logs',
  '/reports':      'Reports',
  '/wall':         'Wall Mode',
};

const SHORTCUTS = [
  { key: 'Ctrl + K', description: 'Open Command Palette' },
  { key: 'Alt + 1',  description: 'Dashboard' },
  { key: 'Alt + 2',  description: 'Live View' },
  { key: 'Alt + 3',  description: 'Playback' },
  { key: 'Alt + 4',  description: 'Events' },
  { key: 'Alt + 5',  description: 'Alarms' },
  { key: 'Alt + 6',  description: 'Cameras' },
  { key: 'Alt + 7',  description: 'Map' },
  { key: 'Alt + 8',  description: 'PTZ' },
  { key: 'Alt + 9',  description: 'Investigation' },
  { key: 'Alt + 0',  description: 'Users' },
  { key: 'G',        description: 'Toggle grid layout' },
  { key: 'W',        description: 'Toggle fullscreen wall mode' },
  { key: 'Esc',      description: 'Close panel / dialog' },
  { key: '?',        description: 'Show shortcuts' },
];

const PAGE_PATHS = ['/dashboard', '/live', '/playback', '/events', '/alarms', '/cameras', '/map', '/ptz', '/investigation', '/users'];

interface AppLayoutProps { children: React.ReactNode }

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [alarmToastOpen, setAlarmToastOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const isDark = theme === 'dark' || theme === 'dim';

  const pageTitle = PAGE_TITLES[location] ?? 'NexusGuard VMS';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setCmdOpen(o => !o); return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') { setShortcutsOpen(o => !o); return; }
      }
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (PAGE_PATHS[idx]) { e.preventDefault(); setLocation(PAGE_PATHS[idx]); }
        return;
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setLocation]);

  useEffect(() => {
    const timer = setTimeout(() => setAlarmToastOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar onShortcutsOpen={() => setShortcutsOpen(true)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-12 flex items-center px-5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-foreground leading-none">{pageTitle}</h1>
            <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground)_/_0.6)] mt-0.5 tracking-wide">
              NexusGuard Industrial Complex / {pageTitle}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 px-3 h-7 rounded border border-border/70 text-[hsl(var(--muted-foreground))] hover:text-foreground hover:border-border hover:bg-[hsl(var(--accent))] transition-all text-[11px]"
              data-testid="button-command-palette"
            >
              <span>Search...</span>
              <span className="font-mono text-[9px] opacity-50">Ctrl K</span>
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-7 h-7 rounded border border-border/70 text-[hsl(var(--muted-foreground))] hover:text-foreground hover:border-border hover:bg-[hsl(var(--accent))] transition-all"
              data-testid="button-theme-toggle-header"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.13, ease: 'easeOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <StatusStrip />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AlarmToast open={alarmToastOpen} onClose={() => setAlarmToastOpen(false)} />

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-semibold">Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-px py-1">
            {SHORTCUTS.map(s => (
              <div key={s.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[hsl(var(--accent))] transition-colors">
                <span className="text-[12px] text-[hsl(var(--muted-foreground))]">{s.description}</span>
                <Kbd className="font-mono text-[9px] ml-4 shrink-0">{s.key}</Kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

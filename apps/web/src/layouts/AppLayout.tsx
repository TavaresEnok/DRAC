import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { StatusStrip } from '../components/StatusStrip';
import { CommandPalette } from '../components/CommandPalette';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useThemeStore } from '../store/themeStore';
import { useVmsDataStore } from '../store/vmsDataStore';

const PAGE_TITLES: Record<string, string> = {
  '/live':          'Ao Vivo',
  '/playback':      'Reprodução',
  '/alarms':        'Alertas',
  '/cameras':       'Câmeras',
  '/map':           'Mapa / Planta',
  '/ptz':           'Controle PTZ',
  '/investigation': 'Investigação',
  '/storage':       'Armazenamento',
  '/settings':      'Configurações',
  '/users':         'Usuários',
  '/roles':         'Funções e Permissões',
  '/groups':        'Grupos',
  '/wall':          'Modo Mural',
};

function resolvePageTitle(location: string) {
  if (PAGE_TITLES[location]) return PAGE_TITLES[location];
  if (location.startsWith('/cameras/')) return 'Detalhe da Câmera';
  const base = '/' + (location.split('/')[1] ?? '');
  return PAGE_TITLES[base] ?? 'DRAC VMS';
}

const SHORTCUTS = [
  { key: 'Ctrl + K', description: 'Abrir paleta de comandos' },
  { key: 'Alt + 1',  description: 'Ao Vivo' },
  { key: 'Alt + 2',  description: 'Reprodução' },
  { key: 'Alt + 3',  description: 'Câmeras' },
  { key: 'Alt + 4',  description: 'Monitoramento' },
  { key: 'Alt + 5',  description: 'Usuários' },
  { key: 'Alt + 6',  description: 'Configurações' },
  { key: 'G',        description: 'Alternar layout em grade' },
  { key: 'W',        description: 'Alternar modo mural em tela cheia' },
  { key: 'Esc',      description: 'Fechar painel / diálogo' },
  { key: '?',        description: 'Mostrar atalhos' },
];

const PAGE_PATHS = ['/live', '/playback', '/cameras', '/storage', '/users', '/settings'];

interface AppLayoutProps { children: React.ReactNode }

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setAtalhosOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const cameras = useVmsDataStore((state) => state.cameras);
  const isDark = theme === 'dark' || theme === 'dim';
  const pageTitle = resolvePageTitle(location);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setCmdOpen(o => !o); return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') { setAtalhosOpen(o => !o); return; }
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        onAtalhosOpen={() => setAtalhosOpen(true)}
        onSearchOpen={() => setCmdOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-12 flex items-center px-5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-foreground leading-none">{pageTitle}</h1>
            <div className="text-[10px] text-[hsl(var(--muted-foreground)_/_0.68)] mt-0.5">
              {cameras.length} câmera{cameras.length === 1 ? '' : 's'} cadastrada{cameras.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
              className="flex items-center justify-center w-7 h-7 rounded border border-border/70 text-[hsl(var(--muted-foreground))] hover:text-foreground hover:border-border hover:bg-[hsl(var(--accent))] transition-all"
              data-testid="button-theme-toggle-header"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.13, ease: 'easeOut' }}
              className="h-full min-h-0 overflow-hidden"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <StatusStrip />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setAtalhosOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-semibold">Atalhos de Teclado</DialogTitle>
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

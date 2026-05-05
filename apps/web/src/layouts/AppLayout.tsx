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
import { useVmsDataStore } from '../store/vmsDataStore';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Central de Comando',
  '/live':         'Ao Vivo',
  '/playback':     'Reprodução',
  '/events':       'Log de Eventos',
  '/alarms':       'Gestão de Alertas',
  '/cameras':      'Gestão de Câmeras',
  '/cameras/':     'Detalhe da Câmera',
  '/map':          'Mapa / Planta',
  '/ptz':          'Controle PTZ',
  '/investigation':'Modo Investigação',
  '/evidence':     'Exportar Evidências',
  '/storage':      'Armazenamento e Retenção',
  '/settings':     'Configurações',
  '/users':        'Gestão de Usuários',
  '/roles':        'Perfis e Permissões',
  '/audit':        'Logs de Auditoria',
  '/reports':      'Relatórios',
  '/wall':         'Modo Mural',
};

const SHORTCUTS = [
  { key: 'Ctrl + K', description: 'Abrir paleta de comandos' },
  { key: 'Alt + 1',  description: 'Painel' },
  { key: 'Alt + 2',  description: 'Ao Vivo' },
  { key: 'Alt + 3',  description: 'Reprodução' },
  { key: 'Alt + 4',  description: 'Eventos' },
  { key: 'Alt + 5',  description: 'Alertas' },
  { key: 'Alt + 6',  description: 'Câmeras' },
  { key: 'Alt + 7',  description: 'Mapa' },
  { key: 'Alt + 8',  description: 'PTZ' },
  { key: 'Alt + 9',  description: 'Investigação' },
  { key: 'Alt + 0',  description: 'Usuários' },
  { key: 'G',        description: 'Alternar layout em grade' },
  { key: 'W',        description: 'Alternar modo mural em tela cheia' },
  { key: 'Esc',      description: 'Fechar painel / diálogo' },
  { key: '?',        description: 'Mostrar atalhos' },
];

const PAGE_PATHS = ['/dashboard', '/live', '/playback', '/events', '/alarms', '/cameras', '/map', '/ptz', '/investigation', '/users'];

interface AppLayoutProps { children: React.ReactNãode }

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setAtalhosOpen] = useState(false);
  const [alarmToastOpen, setAlarmToastOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const system = useVmsDataStore((state) => state.system);
  const cameras = useVmsDataStore((state) => state.cameras);
  const isDark = theme === 'dark' || theme === 'dim';

  const pageTitle = PAGE_TITLES[location] ?? 'NexusGuard VMS';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); setCmdOpen(o => !o); return;
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagNome;
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

  useEffect(() => {
    const timer = setTimeout(() => setAlarmToastOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar onAtalhosOpen={() => setAtalhosOpen(true)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-12 flex items-center px-5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-foreground leading-none">{pageTitle}</h1>
            <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground)_/_0.6)] mt-0.5 tracking-wide">
              {(system?.server.hostname ?? 'NexusGuard Host')} / {pageTitle} / {cameras.length} CAM
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="flex items-center gap-2 px-3 h-7 rounded border border-border/70 text-[hsl(var(--muted-foreground))] hover:text-foreground hover:border-border hover:bg-[hsl(var(--accent))] transition-all text-[11px]"
              data-testid="button-command-palette"
            >
              <span>Buscar...</span>
              <span className="font-mono text-[9px] opacity-50">Ctrl K</span>
            </button>
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

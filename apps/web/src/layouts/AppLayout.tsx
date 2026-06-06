import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from '../components/Sidebar';
import { StatusStrip } from '../components/StatusStrip';
import { CommandPalette } from '../components/CommandPalette';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

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
        <main className="flex-1 overflow-auto">
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

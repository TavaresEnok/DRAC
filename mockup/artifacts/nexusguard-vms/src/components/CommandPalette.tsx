import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutDashboard, Monitor, PlaySquare, Activity, Bell,
  Camera, Map, Crosshair, Search, Archive, Settings,
  HardDrive, LogOut, Sun, Moon, Shield, Clock
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

const PAGES = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, description: 'Command center overview' },
  { label: 'Live View', path: '/live', icon: Monitor, description: 'Camera grid and controls' },
  { label: 'Playback', path: '/playback', icon: PlaySquare, description: 'Review recorded footage' },
  { label: 'Events', path: '/events', icon: Activity, description: 'Event log & investigation' },
  { label: 'Alarms', path: '/alarms', icon: Bell, description: 'Alarm management' },
  { label: 'Cameras', path: '/cameras', icon: Camera, description: 'Camera management & config' },
  { label: 'Map / Floorplan', path: '/map', icon: Map, description: 'Interactive facility map' },
  { label: 'PTZ Control', path: '/ptz', icon: Crosshair, description: 'Pan-tilt-zoom controller' },
  { label: 'Investigation', path: '/investigation', icon: Search, description: 'Multi-camera investigation workspace' },
  { label: 'Evidence Export', path: '/evidence', icon: Archive, description: 'Export evidence packages' },
  { label: 'Storage', path: '/storage', icon: HardDrive, description: 'Storage capacity and retention' },
  { label: 'Settings', path: '/settings', icon: Settings, description: 'System configuration' },
];

const RECENT = [
  { label: 'Live View — Perimeter Grid', path: '/live', icon: Clock },
  { label: 'Investigate Sector 3 Incident', path: '/investigation', icon: Clock },
  { label: 'Export INC-2024-0847 Package', path: '/evidence', icon: Clock },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [, setLocation] = useLocation();
  const { logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const navigate = (path: string) => {
    setLocation(path);
    onClose();
  };

  const handleAction = (action: string) => {
    if (action === 'logout') { logout(); setLocation('/login'); onClose(); }
    if (action === 'theme') { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose(); }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
        style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="w-full max-w-lg rounded-lg border border-border overflow-hidden shadow-2xl"
          style={{ background: 'hsl(var(--card))' }}
          onClick={e => e.stopPropagation()}
        >
          <Command className="bg-transparent">
            <div className="border-b border-border px-1">
              <CommandInput
                placeholder="Search pages, cameras, actions..."
                className="h-12 text-sm border-none bg-transparent focus:ring-0"
                autoFocus
              />
            </div>
            <CommandList className="max-h-80">
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">No results found</div>
              </CommandEmpty>

              <CommandGroup heading="Recent">
                {RECENT.map(item => (
                  <CommandItem key={item.label} onSelect={() => navigate(item.path)} className="gap-3 py-2.5 cursor-pointer">
                    <item.icon className="w-4 h-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                    <span className="text-sm">{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Navigate">
                {PAGES.map(page => (
                  <CommandItem key={page.path} onSelect={() => navigate(page.path)} className="gap-3 py-2.5 cursor-pointer">
                    <page.icon className="w-4 h-4 shrink-0 text-[hsl(var(--primary))]" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{page.label}</span>
                      <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{page.description}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Actions">
                <CommandItem onSelect={() => handleAction('theme')} className="gap-3 py-2.5 cursor-pointer">
                  {theme === 'dark' ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                  <span className="text-sm">Toggle {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                </CommandItem>
                <CommandItem onSelect={() => handleAction('logout')} className="gap-3 py-2.5 cursor-pointer">
                  <LogOut className="w-4 h-4 shrink-0 text-[hsl(var(--destructive))]" />
                  <span className="text-sm text-[hsl(var(--destructive))]">Logout</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>

            <div className="border-t border-border px-3 py-2 flex items-center gap-4" style={{ fontSize: '11px' }}>
              <span className="font-mono text-[hsl(var(--muted-foreground))]">↑↓ navigate</span>
              <span className="font-mono text-[hsl(var(--muted-foreground))]">↵ select</span>
              <span className="font-mono text-[hsl(var(--muted-foreground))]">esc close</span>
              <span className="ml-auto font-mono text-[hsl(var(--muted-foreground))]">
                <Shield className="w-3 h-3 inline mr-1" />NexusGuard VMS
              </span>
            </div>
          </Command>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

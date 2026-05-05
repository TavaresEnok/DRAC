import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Monitor, PlaySquare, Activity, Bell,
  Camera, Map, Crosshair, Search, Archive, Settings,
  HardDrive, ChevronLeft, ChevronRight, LogOut, Keyboard, Shield,
  Server, Users, Wrench, Radar, Brain, FileText, ClipboardList, Maximize2
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSidebarStore } from '../store/sidebarStore';
import { useAuthStore } from '../store/authStore';
import { useAlarmStore } from '../store/alarmStore';

const NAV_SECTIONS = [
  {
    label: 'Monitoring',
    icon: Radar,
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/live', label: 'Live View', icon: Monitor },
      { path: '/playback', label: 'Playback', icon: PlaySquare },
      { path: '/events', label: 'Events', icon: Activity },
      { path: '/alarms', label: 'Alarms', icon: Bell, alarms: true },
    ],
  },
  {
    label: 'Operations',
    icon: Wrench,
    items: [
      { path: '/investigation', label: 'Investigation', icon: Search },
      { path: '/evidence', label: 'Evidence Export', icon: Archive },
      { path: '/ai', label: 'AI Assistant', icon: Brain },
    ],
  },
  {
    label: 'Infrastructure',
    icon: Server,
    items: [
      { path: '/cameras', label: 'Cameras', icon: Camera },
      { path: '/map', label: 'Map / Floorplan', icon: Map },
      { path: '/ptz', label: 'PTZ Control', icon: Crosshair },
      { path: '/storage', label: 'Storage', icon: HardDrive },
    ],
  },
  {
    label: 'Administration',
    icon: Users,
    items: [
      { path: '/users', label: 'Users', icon: Users },
      { path: '/roles', label: 'Roles', icon: Shield },
      { path: '/audit', label: 'Audit Logs', icon: ClipboardList },
      { path: '/reports', label: 'Reports', icon: FileText },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/* Role accent — no red for admin; steel blue hierarchy */
const ROLE_COLOR: Record<string, string> = {
  admin:      'text-[hsl(var(--primary))]',
  supervisor: 'text-[hsl(var(--chart-2))]',
  operator:   'text-[hsl(var(--muted-foreground))]',
};

export function Sidebar({ onShortcutsOpen }: { onShortcutsOpen?: () => void }) {
  const { isExpanded, toggle } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const { alarms } = useAlarmStore();
  const [location] = useLocation();

  const activeAlarmCount = alarms.filter(a => a.status === 'active').length;
  const roleColor = ROLE_COLOR[user?.role ?? 'operator'] ?? ROLE_COLOR.operator;

  return (
    <motion.aside
      animate={{ width: isExpanded ? 240 : 56 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="sidebar-shell relative flex flex-col h-full overflow-hidden shrink-0"
      style={{ minWidth: isExpanded ? 240 : 56 }}
    >
      {/* ── Brand header ── */}
      <div className="sidebar-brand flex items-center h-14 px-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="sidebar-mark shrink-0 w-8 h-8 rounded-xl flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
          </div>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.08 }}
              className="min-w-0"
            >
              <div className="text-[13px] font-semibold text-sidebar-foreground leading-tight tracking-tight">NexusGuard</div>
              <div className="text-[9px] font-mono text-[hsl(var(--muted-foreground))] tracking-[0.18em] uppercase">VMS Command Center</div>
            </motion.div>
          )}
        </div>
        <button
          onClick={toggle}
          className="sidebar-toggle shrink-0 w-7 h-7 flex items-center justify-center rounded-xl transition-colors"
          data-testid="button-sidebar-toggle"
        >
          {isExpanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="space-y-1.5">
            {isExpanded && (
              <div className="flex items-center gap-2 px-3 pt-1 text-[9px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground)_/_0.7)]">
                <section.icon className="w-3 h-3" />
                <span>{section.label}</span>
              </div>
            )}
            <div className="space-y-1.5">
              {section.items.map(({ path, label, icon: Icon, alarms: hasAlarms }) => {
                const isActive = location === path || (path !== '/dashboard' && location.startsWith(path));
                return isExpanded ? (
                  <Link key={path} href={path}>
                    <div
                      data-testid={`nav-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
                      className={`sidebar-item relative flex items-center gap-3 h-10 px-3 rounded-lg cursor-pointer transition-colors duration-150 group
                        ${isActive
                          ? 'sidebar-item-active text-foreground bg-[hsl(var(--accent))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground'
                        }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-[12.5px] font-medium flex-1 truncate">{label}</span>
                      {hasAlarms && activeAlarmCount > 0 && (
                        <span className="shrink-0 min-w-[20px] h-[18px] flex items-center justify-center px-1 rounded-full bg-[hsl(var(--destructive)_/_0.16)] border border-[hsl(var(--destructive)_/_0.28)] text-[hsl(var(--destructive))] text-[9px] font-bold font-mono">
                          {activeAlarmCount}
                        </span>
                      )}
                    </div>
                  </Link>
                ) : (
                  <Tooltip key={path} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Link href={path}>
                        <div
                          className={`relative flex items-center justify-center h-10 w-10 rounded-lg cursor-pointer transition-colors duration-150 mx-auto
                            ${isActive
                              ? 'sidebar-item-active text-foreground bg-[hsl(var(--accent))]'
                              : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-foreground'
                            }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {hasAlarms && activeAlarmCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[hsl(var(--destructive))]" />}
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom controls ── */}
      <div className="sidebar-footer px-2 py-2 shrink-0 space-y-2">
        {/* Keyboard shortcuts — only when expanded */}
        {isExpanded && (
          <button
            onClick={onShortcutsOpen}
            className="sidebar-footer-btn w-full flex items-center gap-3 h-10 px-3 rounded-xl text-[hsl(var(--muted-foreground))] hover:text-sidebar-foreground transition-colors"
          >
            <Keyboard className="w-4 h-4 shrink-0" />
            <span className="text-[12.5px]">Shortcuts</span>
            <span className="ml-auto font-mono text-[9px] text-[hsl(var(--muted-foreground)_/_0.6)] bg-[hsl(var(--border)_/_0.7)] px-1.5 py-0.5 rounded-md">?</span>
          </button>
        )}

        {/* User row */}
        {user && (
          <div className={`sidebar-user flex items-center gap-2.5 h-12 px-2.5 rounded-2xl ${isExpanded ? 'pr-2' : 'justify-center'}`}>
            <div className="shrink-0 w-8 h-8 rounded-xl bg-[hsl(var(--primary)_/_0.12)] border border-[hsl(var(--primary)_/_0.18)] flex items-center justify-center">
              <span className="text-[10px] font-bold text-[hsl(var(--primary))]">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            {isExpanded && (
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-sidebar-foreground truncate leading-tight">{user.name}</div>
                <div className={`text-[9px] font-mono capitalize tracking-[0.12em] ${roleColor}`}>{user.role}</div>
              </div>
            )}
            {isExpanded && (
              <button
                onClick={logout}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_0.08)] transition-colors"
                data-testid="button-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

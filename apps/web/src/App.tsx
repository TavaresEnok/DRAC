import { Suspense, lazy, useEffect } from 'react';
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

import { AppLayout } from './layouts/AppLayout';

import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useVmsDataStore } from './store/vmsDataStore';

const queryClient = new QueryClient();

const LoginPage = lazy(() => import('./pages/LoginPage'));
const LiveViewPage = lazy(() => import('./pages/LiveViewPage'));
const PlaybackPage = lazy(() => import('./pages/PlaybackPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage'));
const CamerasPage = lazy(() => import('./pages/CamerasPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const PTZPage = lazy(() => import('./pages/PTZPage'));
const InvestigationPage = lazy(() => import('./pages/InvestigationPage'));
const EvidencePage = lazy(() => import('./pages/EvidencePage'));
const StoragePage = lazy(() => import('./pages/StoragePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AIPage = lazy(() => import('./pages/AIPage'));
const CameraDetailPage = lazy(() => import('./pages/CameraDetailPage'));
const WallModePage = lazy(() => import('./pages/WallModePage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const NotFound = lazy(() => import('./pages/not-found'));

function AppFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando DRAC VMS...
    </div>
  );
}

function ProtectedRoute({ component: Page, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { isAuthenticated, isBootstrapped, isLoading, user } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isBootstrapped && !isAuthenticated) setLocation('/login');
    if (isBootstrapped && isAuthenticated && adminOnly && user?.role !== 'admin') setLocation('/live');
  }, [adminOnly, isAuthenticated, isBootstrapped, setLocation, user?.role]);

  if (!isBootstrapped || isLoading) {
    return <AppFallback />;
  }

  if (!isAuthenticated) return null;
  if (adminOnly && user?.role !== 'admin') return null;

  return (
    <AppLayout>
      <Page />
    </AppLayout>
  );
}

function RootRedirect() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Redirect to="/live" /> : <Redirect to="/login" />;
}

function ThemeSync() {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'dim') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return null;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/live">
        {() => <ProtectedRoute component={LiveViewPage} />}
      </Route>
      <Route path="/playback">
        {() => <ProtectedRoute component={PlaybackPage} />}
      </Route>
      <Route path="/events">
        {() => <ProtectedRoute component={EventsPage} />}
      </Route>
      <Route path="/alarms">
        {() => <ProtectedRoute component={AlarmsPage} />}
      </Route>
      <Route path="/cameras">
        {() => <ProtectedRoute component={CamerasPage} />}
      </Route>
      <Route path="/map">
        {() => <ProtectedRoute component={MapPage} />}
      </Route>
      <Route path="/ptz">
        {() => <ProtectedRoute component={PTZPage} />}
      </Route>
      <Route path="/investigation">
        {() => <ProtectedRoute component={InvestigationPage} />}
      </Route>
      <Route path="/evidence">
        {() => <ProtectedRoute component={EvidencePage} />}
      </Route>
      <Route path="/storage">
        {() => <ProtectedRoute component={StoragePage} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} adminOnly />}
      </Route>
      <Route path="/ai">
        {() => <ProtectedRoute component={AIPage} />}
      </Route>
      <Route path="/cameras/:id">
        {() => <ProtectedRoute component={CameraDetailPage} />}
      </Route>
      <Route path="/wall">
        {() => <ProtectedRoute component={WallModePage} />}
      </Route>
      <Route path="/users">
        {() => <ProtectedRoute component={UsersPage} adminOnly />}
      </Route>
      <Route path="/roles">
        {() => <ProtectedRoute component={RolesPage} adminOnly />}
      </Route>
      <Route path="/reports">
        {() => <ProtectedRoute component={ReportsPage} />}
      </Route>
      <Route path="/audit">
        {() => <ProtectedRoute component={AuditLogsPage} adminOnly />}
      </Route>
      <Route path="/" component={RootRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loadData = useVmsDataStore((state) => state.load);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Periodically validate the session token (every 5 min).
  // If the token expired while the browser was open, this detects it
  // and redirects to login automatically — no more silent black screens.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void bootstrap();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [bootstrap]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    }
  }, [isAuthenticated, loadData]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ThemeSync />
          <Suspense fallback={<AppFallback />}>
            <AppRoutes />
          </Suspense>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

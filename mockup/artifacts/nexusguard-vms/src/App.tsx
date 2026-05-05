import { useEffect } from 'react';
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';

import { AppLayout } from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LiveViewPage from './pages/LiveViewPage';
import PlaybackPage from './pages/PlaybackPage';
import EventsPage from './pages/EventsPage';
import AlarmsPage from './pages/AlarmsPage';
import CamerasPage from './pages/CamerasPage';
import MapPage from './pages/MapPage';
import PTZPage from './pages/PTZPage';
import InvestigationPage from './pages/InvestigationPage';
import EvidencePage from './pages/EvidencePage';
import StoragePage from './pages/StoragePage';
import SettingsPage from './pages/SettingsPage';
import AIPage from './pages/AIPage';
import CameraDetailPage from './pages/CameraDetailPage';
import WallModePage from './pages/WallModePage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import ReportsPage from './pages/ReportsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import NotFound from './pages/not-found';

import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';

const queryClient = new QueryClient();

function ProtectedRoute({ component: Page }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) setLocation('/login');
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <AppLayout>
      <Page />
    </AppLayout>
  );
}

function RootRedirect() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Redirect to="/dashboard" /> : <Redirect to="/login" />;
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
      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
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
        {() => <ProtectedRoute component={SettingsPage} />}
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
        {() => <ProtectedRoute component={UsersPage} />}
      </Route>
      <Route path="/roles">
        {() => <ProtectedRoute component={RolesPage} />}
      </Route>
      <Route path="/reports">
        {() => <ProtectedRoute component={ReportsPage} />}
      </Route>
      <Route path="/audit">
        {() => <ProtectedRoute component={AuditLogsPage} />}
      </Route>
      <Route path="/" component={RootRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ThemeSync />
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

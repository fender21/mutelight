import { useEffect } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useLiveStore } from '../stores/liveStore';
import { Button } from './ui/Button';
import { Home, Lightbulb, Plug, Settings, LogOut, Zap } from 'lucide-react';

export function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const startLive = useLiveStore((s) => s.start);
  const stopLive = useLiveStore((s) => s.stop);

  // Live gateway/device updates over WebSocket for all dashboard pages
  useEffect(() => {
    startLive();
  }, [startLive]);

  const handleLogout = async () => {
    stopLive();
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-6">
            <Link to="/" className="flex items-center space-x-2">
              <Zap className="h-6 w-6 text-primary" />
              <span className="text-xl font-semibold">MuteBeacon</span>
            </Link>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full justify-start">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <Link to="/devices">
              <Button variant="ghost" className="w-full justify-start">
                <Lightbulb className="mr-2 h-4 w-4" />
                Devices
              </Button>
            </Link>
            <Link to="/integrations">
              <Button variant="ghost" className="w-full justify-start">
                <Plug className="mr-2 h-4 w-4" />
                Integrations
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
          </nav>

          <div className="border-t border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{user?.email}</span>
                <span className="text-xs text-muted-foreground">Free Plan</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-background">
        <Outlet />
      </main>
    </div>
  );
}

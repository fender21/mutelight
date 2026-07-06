import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLiveStore } from '../stores/liveStore';

export function Settings() {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuthStore();
  const stopLive = useLiveStore((s) => s.stop);

  const handleLogout = async () => {
    stopLive();
    await logout();
    navigate('/login');
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
          <CardDescription>You are signed in to MuteBeacon</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="text-sm">{user?.email ?? '—'}</p>
          </div>
          <Button variant="outline" onClick={handleLogout} disabled={isLoading}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

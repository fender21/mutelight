import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Activity, Lightbulb, Monitor, Radio, Trash2 } from 'lucide-react';
import { apiErrorMessage, devicesApi, gatewaysApi, pairApi, stateDisplayColor } from '../lib/beacon';
import { liveEffectiveState, useLiveStore } from '../stores/liveStore';
import type { GatewaySummary } from '../../../shared/protocol';

function StateBadge({ state }: { state: string | null }) {
  if (!state) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: stateDisplayColor(state) }}
      />
      {state}
    </span>
  );
}

export function Dashboard() {
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pairing form
  const [pairCode, setPairCode] = useState('');
  const [pairName, setPairName] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairSuccess, setPairSuccess] = useState<string | null>(null);

  const liveGateways = useLiveStore((s) => s.gateways);

  const load = useCallback(async () => {
    try {
      const [gws, deviceList] = await Promise.all([gatewaysApi.list(), devicesApi.list()]);
      setGateways(gws);
      setDeviceCount(deviceList.devices.length);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load dashboard data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Merge REST snapshot with live WS state
  const gatewayRows = useMemo(
    () =>
      gateways.map((gw) => {
        const live = liveGateways[gw.id];
        return {
          ...gw,
          online: live ? live.online : gw.online,
          discordConnected: live?.status?.discordConnected ?? null,
          effectiveState: live?.online ? live.status?.effectiveState ?? null : null,
        };
      }),
    [gateways, liveGateways]
  );

  const onlineCount = gatewayRows.filter((g) => g.online).length;
  const currentState = liveEffectiveState(liveGateways);
  const discordConnected = gatewayRows.some((g) => g.online && g.discordConnected);

  const handleClaim = async (e: FormEvent) => {
    e.preventDefault();
    setPairing(true);
    setPairError(null);
    setPairSuccess(null);
    try {
      const gateway = await pairApi.claim(pairCode.trim().toUpperCase(), pairName);
      setGateways((prev) => [...prev, gateway]);
      setPairSuccess(`Paired "${gateway.name}" — it will come online in a few seconds.`);
      setPairCode('');
      setPairName('');
    } catch (err) {
      setPairError(apiErrorMessage(err, 'Pairing failed — check the code and try again'));
    } finally {
      setPairing(false);
    }
  };

  const handleRemoveGateway = async (gw: GatewaySummary) => {
    if (!window.confirm(`Remove "${gw.name}"? The desktop client will need to be paired again.`)) {
      return;
    }
    try {
      await gatewaysApi.remove(gw.id);
      setGateways((prev) => prev.filter((g) => g.id !== gw.id));
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to remove gateway'));
    }
  };

  const showPairingChecklist = !loading && gateways.length === 0;
  const showDeviceChecklist = !loading && gateways.length > 0 && deviceCount === 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your beacon at a glance</p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* First-run checklist */}
      {(showPairingChecklist || showDeviceChecklist) && (
        <Card className="mb-8 border-secondary/40">
          <CardHeader>
            <CardTitle className="text-lg">Get set up</CardTitle>
            <CardDescription>
              {showPairingChecklist
                ? 'Install the MuteBeacon desktop app on your computer, then enter its pairing code below.'
                : 'Your desktop client is paired — now add a light on the Devices page.'}
            </CardDescription>
          </CardHeader>
          {showDeviceChecklist && (
            <CardContent>
              <Link to="/devices">
                <Button variant="secondary" size="sm">
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Add a device
                </Button>
              </Link>
            </CardContent>
          )}
        </Card>
      )}

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Computers</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {onlineCount}
              <span className="text-base font-normal text-muted-foreground">
                {' '}/ {gateways.length} online
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Paired desktop clients</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Devices</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deviceCount ?? '—'}</div>
            <p className="text-xs text-muted-foreground">Managed WLED lights</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current state</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex h-8 items-center text-lg font-bold">
              {currentState ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stateDisplayColor(currentState) }}
                  />
                  {currentState}
                </span>
              ) : (
                <span className="text-muted-foreground">offline</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Live beacon state</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discord</CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={'text-2xl font-bold ' + (discordConnected ? 'text-primary' : '')}>
              {discordConnected ? 'Connected' : 'Not connected'}
            </div>
            <p className="text-xs text-muted-foreground">Via the desktop client</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gateways */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your computers</CardTitle>
            <CardDescription>Desktop clients paired with this account</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : gatewayRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No computers paired yet. Enter a pairing code on the right to connect one.
              </p>
            ) : (
              <div className="space-y-3">
                {gatewayRows.map((gw) => (
                  <div
                    key={gw.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={
                          'h-2.5 w-2.5 shrink-0 rounded-full ' +
                          (gw.online ? 'bg-primary' : 'bg-muted-foreground/40')
                        }
                        title={gw.online ? 'Online' : 'Offline'}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{gw.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {gw.online
                            ? gw.discordConnected === null
                              ? 'Online'
                              : gw.discordConnected
                                ? 'Discord connected'
                                : 'Discord not detected'
                            : gw.lastSeen
                              ? `Last seen ${new Date(gw.lastSeen).toLocaleString()}`
                              : 'Never connected'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StateBadge state={gw.effectiveState} />
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveGateway(gw)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pairing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pair a computer</CardTitle>
            <CardDescription>
              Open the MuteBeacon desktop app and type the code it shows here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleClaim} className="space-y-4">
              {pairError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {pairError}
                </div>
              )}
              {pairSuccess && (
                <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
                  {pairSuccess}
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="pair-code" className="text-sm font-medium">
                  Pairing code
                </label>
                <Input
                  id="pair-code"
                  placeholder="K7F3QP"
                  value={pairCode}
                  onChange={(e) => setPairCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase tracking-widest"
                  minLength={4}
                  maxLength={12}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pair-name" className="text-sm font-medium">
                  Computer name <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="pair-name"
                  placeholder="Office PC"
                  value={pairName}
                  onChange={(e) => setPairName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <Button type="submit" disabled={pairing || pairCode.trim().length < 4}>
                {pairing ? 'Pairing...' : 'Pair computer'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

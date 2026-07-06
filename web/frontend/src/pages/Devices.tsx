import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Plus,
  Trash2,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  apiErrorMessage,
  devicesApi,
  STATE_DEFAULTS,
  STATE_ORDER,
} from '../lib/beacon';
import { liveDiscovered, useLiveStore } from '../stores/liveStore';
import type {
  DiscoveredDevice,
  ManagedDevice,
  StateLightConfigDTO,
} from '../../../shared/protocol';

// ---------------------------------------------------------------------------
// Per-state color editor
// ---------------------------------------------------------------------------

interface EditorRow {
  color: string;
  brightness: number;
  enabled: boolean;
  /** Only customized rows are persisted in stateColors. */
  customized: boolean;
}

function buildEditorRows(device: ManagedDevice): Record<string, EditorRow> {
  const rows: Record<string, EditorRow> = {};
  const fallbackBrightness = device.defaultBrightness ?? 128;
  for (const state of STATE_ORDER) {
    const saved = device.stateColors?.[state];
    if (saved) {
      rows[state] = {
        color: saved.color,
        brightness: saved.brightness,
        enabled: saved.enabled,
        customized: true,
      };
    } else {
      const def = STATE_DEFAULTS[state];
      rows[state] = {
        color: def.color,
        brightness: fallbackBrightness,
        enabled: def.enabled,
        customized: false,
      };
    }
  }
  return rows;
}

function StateColorEditor({
  device,
  onSaved,
  onError,
}: {
  device: ManagedDevice;
  onSaved: (device: ManagedDevice) => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, EditorRow>>(() => buildEditorRows(device));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const updateRow = (state: string, patch: Partial<EditorRow>) => {
    setRows((prev) => ({
      ...prev,
      [state]: { ...prev[state], ...patch, customized: true },
    }));
    setSavedFlash(false);
  };

  const resetRow = (state: string) => {
    const def = STATE_DEFAULTS[state];
    setRows((prev) => ({
      ...prev,
      [state]: {
        color: def.color,
        brightness: device.defaultBrightness ?? 128,
        enabled: def.enabled,
        customized: false,
      },
    }));
    setSavedFlash(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send customized states; missing keys fall back to defaults on
      // the gateway.
      const stateColors: Partial<Record<string, StateLightConfigDTO>> = {};
      for (const [state, row] of Object.entries(rows)) {
        if (row.customized) {
          stateColors[state] = {
            color: row.color,
            brightness: row.brightness,
            enabled: row.enabled,
          };
        }
      }
      const updated = await devicesApi.update(device.id, { stateColors });
      onSaved(updated);
      setRows(buildEditorRows(updated));
      setSavedFlash(true);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to save state colors'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border px-6 py-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Choose what this light does for each beacon state. Rows marked{' '}
        <span className="text-foreground">default</span> use the built-in colors and are not
        saved — only customized rows are stored.
      </p>
      <div className="space-y-2">
        {STATE_ORDER.map((state) => {
          const row = rows[state];
          return (
            <div
              key={state}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/50 px-3 py-2"
            >
              <label className="flex w-40 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(state, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                <span className={row.enabled ? '' : 'text-muted-foreground'}>{state}</span>
              </label>
              <input
                type="color"
                value={row.color}
                onChange={(e) => updateRow(state, { color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
                title={`Color for ${state}`}
              />
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-muted-foreground">Brightness</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={row.brightness}
                  onChange={(e) => updateRow(state, { brightness: Number(e.target.value) })}
                  className="w-full max-w-48 accent-primary"
                />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {row.brightness}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ' +
                    (row.customized
                      ? 'bg-secondary/20 text-secondary'
                      : 'bg-muted text-muted-foreground')
                  }
                >
                  {row.customized ? 'custom' : 'default'}
                </span>
                {row.customized && (
                  <button
                    type="button"
                    onClick={() => resetRow(state)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save state colors'}
        </Button>
        {savedFlash && <span className="text-xs text-primary">Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Managed device card
// ---------------------------------------------------------------------------

function DeviceCard({
  device,
  onChanged,
  onDeleted,
  onError,
}: {
  device: ManagedDevice;
  onChanged: (device: ManagedDevice) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const toggleEnabled = async () => {
    setBusy(true);
    try {
      const updated = await devicesApi.update(device.id, { enabled: !device.enabled });
      onChanged(updated);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to update device'));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      const sent = await devicesApi.test(device.id);
      setTestResult(sent ? 'Flash sent — the light should blink purple.' : 'No desktop client online to deliver the flash.');
    } catch (error) {
      onError(apiErrorMessage(error, 'Test flash failed'));
    } finally {
      setBusy(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove "${device.name}"? The light will stop reacting to beacon states.`)) {
      return;
    }
    setBusy(true);
    try {
      await devicesApi.remove(device.id);
      onDeleted(device.id);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to delete device'));
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{device.name}</p>
            <p className="text-xs text-muted-foreground">{device.ip_address}</p>
          </div>
        </div>

        {/* Enabled toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={device.enabled}
          onClick={toggleEnabled}
          disabled={busy}
          className={
            'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ' +
            (device.enabled ? 'bg-primary' : 'bg-muted')
          }
          title={device.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        >
          <span
            className={
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' +
              (device.enabled ? 'left-[22px]' : 'left-0.5')
            }
          />
        </button>

        <Button variant="outline" size="sm" onClick={handleTest} disabled={busy}>
          <Zap className="mr-1 h-3 w-3" />
          Test
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-1 text-xs">Colors</span>
        </Button>
      </div>

      {testResult && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">{testResult}</p>
      )}

      {expanded && (
        <StateColorEditor device={device} onSaved={onChanged} onError={onError} />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Devices page
// ---------------------------------------------------------------------------

export function Devices() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [restDiscovered, setRestDiscovered] = useState<DiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingIp, setAddingIp] = useState<string | null>(null);

  // Manual add form
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const liveGateways = useLiveStore((s) => s.gateways);

  const load = useCallback(async () => {
    try {
      const result = await devicesApi.list();
      setDevices(result.devices);
      setRestDiscovered(result.discovered);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load devices'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Union of REST snapshot + live WS discovery, minus already-managed IPs
  const discovered = useMemo(() => {
    const managedIps = new Set(devices.map((d) => d.ip_address));
    const byIp = new Map<string, DiscoveredDevice>();
    for (const d of restDiscovered) byIp.set(d.ip, d);
    for (const d of liveDiscovered(liveGateways)) byIp.set(d.ip, d);
    return Array.from(byIp.values()).filter((d) => !managedIps.has(d.ip));
  }, [devices, restDiscovered, liveGateways]);

  const anyGatewayOnline = Object.values(liveGateways).some((g) => g.online);

  const addDevice = async (name: string, ip: string) => {
    const device = await devicesApi.create({ name, ip_address: ip });
    setDevices((prev) => [...prev, device]);
  };

  const handleAddDiscovered = async (d: DiscoveredDevice) => {
    setAddingIp(d.ip);
    setError(null);
    try {
      await addDevice(d.name || `WLED ${d.ip}`, d.ip);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to add device'));
    } finally {
      setAddingIp(null);
    }
  };

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    setManualBusy(true);
    setError(null);
    try {
      await addDevice(manualName.trim(), manualIp.trim());
      setManualName('');
      setManualIp('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to add device'));
    } finally {
      setManualBusy(false);
    }
  };

  const handleChanged = (device: ManagedDevice) => {
    setDevices((prev) => prev.map((d) => (d.id === device.id ? device : d)));
  };

  const handleDeleted = (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Devices</h1>
        <p className="text-muted-foreground">
          Manage the WLED lights that react to your beacon states
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Found on your network */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold">Found on your network</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          WLED devices your desktop client discovered via mDNS. Add one to start controlling it.
        </p>

        {discovered.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Wifi className="h-5 w-5 shrink-0" />
              <span>
                {anyGatewayOnline
                  ? 'No unmanaged WLED devices found yet. Devices on your network appear here automatically while the desktop client is online.'
                  : 'No desktop client is online. Install and pair the MuteBeacon desktop app — devices on your network will appear here automatically.'}
              </span>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {discovered.map((d) => (
              <Card key={d.ip}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name || 'WLED device'}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.ip}
                      {d.port && d.port !== 80 ? `:${d.port}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddDiscovered(d)}
                    disabled={addingIp === d.ip}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {addingIp === d.ip ? 'Adding...' : 'Add'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Manual add fallback */}
        <form
          onSubmit={handleManualAdd}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="min-w-40 flex-1 space-y-1">
            <label htmlFor="manual-name" className="text-xs font-medium text-muted-foreground">
              Add manually — name
            </label>
            <Input
              id="manual-name"
              placeholder="Desk light"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              required
            />
          </div>
          <div className="min-w-40 flex-1 space-y-1">
            <label htmlFor="manual-ip" className="text-xs font-medium text-muted-foreground">
              IP address
            </label>
            <Input
              id="manual-ip"
              placeholder="192.168.1.50"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={manualBusy}>
            {manualBusy ? 'Adding...' : 'Add device'}
          </Button>
        </form>
      </section>

      {/* Your devices */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Your devices</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          These lights follow your beacon state. Expand a device to customize per-state colors.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading devices...</p>
        ) : devices.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No devices yet</CardTitle>
              <CardDescription>
                Add a discovered device above (or enter one manually) and it will light up with
                your Discord and Claude Code activity.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onChanged={handleChanged}
                onDeleted={handleDeleted}
                onError={setError}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

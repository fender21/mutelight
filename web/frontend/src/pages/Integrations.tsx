import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Monitor,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import {
  apiDisplayOrigin,
  apiErrorMessage,
  hookDisplayUrl,
  integrationsApi,
  keysApi,
  STATE_DEFAULTS,
} from '../lib/beacon';
import {
  INTEGRATION_CATALOG,
  type IntegrationKind,
  type IntegrationProvider,
} from '../../../shared/integrations';
import type { ApiKeySummary, IntegrationInstance, TriggerRule } from '../../../shared/protocol';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** States offered in the rule editor dropdown (open set — custom allowed). */
const KNOWN_STATES = [
  'connected',
  'muted',
  'deafened',
  'streaming',
  'speaking',
  'idle',
  'off',
  'claude-working',
  'claude-attention',
  'claude-done',
] as const;

const CUSTOM_STATE = '__custom__';

function ruleStateColor(state: string): string {
  if (state === 'off') return '#000000';
  return STATE_DEFAULTS[state]?.color ?? '#a3a3a3';
}

function StateDot({ state }: { state: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: ruleStateColor(state) }}
      aria-hidden
    />
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — select-and-copy manually
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="mr-1 h-3 w-3 text-primary" /> : <Copy className="mr-1 h-3 w-3" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** Read-only monospace value with a copy button. */
function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <CopyButton text={value} />
    </div>
  );
}

const KIND_META: Record<IntegrationKind, { label: string; icon: typeof Webhook; className: string }> = {
  webhook: { label: 'Webhook', icon: Webhook, className: 'bg-primary/10 text-primary' },
  hooks: { label: 'Command hooks', icon: Terminal, className: 'bg-secondary/20 text-secondary' },
  local: { label: 'Built-in', icon: Monitor, className: 'bg-muted text-muted-foreground' },
};

function KindBadge({ kind }: { kind: IntegrationKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.className}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Claude Code snippet generator (hooks JSON pre-filled with an API key)
// ---------------------------------------------------------------------------

function buildClaudeHooksSnippet(key: string): string {
  const beaconUrl = `${apiDisplayOrigin()}/api/beacon`;
  const curl = (payload: Record<string, unknown>) =>
    `curl.exe -s -X POST ${beaconUrl} -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "${JSON.stringify(payload).replace(/"/g, '\\"')}"`;

  return JSON.stringify(
    {
      hooks: {
        Notification: [
          { hooks: [{ type: 'command', command: curl({ state: 'claude-attention', source: 'claude' }) }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: curl({ state: 'claude-done', ttlMs: 4000, source: 'claude' }) }] },
        ],
      },
    },
    null,
    2
  );
}

/**
 * Self-sufficient API-key flow for the Claude Code drawer: create a key in
 * one click (or pick an existing one) and generate the hooks snippet.
 */
function ClaudeSnippetSection({
  keys,
  createdKey,
  creating,
  onCreateKey,
}: {
  keys: ApiKeySummary[];
  createdKey: ApiKeySummary | null;
  creating: boolean;
  onCreateKey: (label: string) => Promise<void>;
}) {
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  // Prefer the key created this session (the only one whose secret we know).
  useEffect(() => {
    if (createdKey) setSelectedKeyId(createdKey.id);
  }, [createdKey]);

  const effectiveKeyId = selectedKeyId ?? createdKey?.id ?? keys[0]?.id ?? null;
  const selectedIsCreated = createdKey != null && effectiveKeyId === createdKey.id;
  const snippetKey = selectedIsCreated ? createdKey!.key! : '<YOUR_API_KEY>';
  const claudeSnippet = buildClaudeHooksSnippet(snippetKey);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">API key &amp; generated snippet</p>

      {keys.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/50 p-3">
          <p className="flex-1 text-xs text-muted-foreground">
            You need an API key so the hooks can authenticate. Create one now — the snippet fills
            in automatically.
          </p>
          <Button size="sm" onClick={() => onCreateKey('Claude Code')} disabled={creating}>
            <KeyRound className="mr-1 h-3 w-3" />
            {creating ? 'Creating...' : 'Create API key'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border bg-background/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="claude-key-select" className="text-xs text-muted-foreground">
              Key
            </label>
            <select
              id="claude-key-select"
              value={effectiveKeyId ?? ''}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} ({k.prefix}…{createdKey?.id === k.id ? ', created just now' : ''})
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => onCreateKey('Claude Code')} disabled={creating}>
              <Plus className="mr-1 h-3 w-3" />
              {creating ? 'Creating...' : 'New key'}
            </Button>
          </div>
          {!selectedIsCreated && (
            <p className="text-xs text-muted-foreground">
              Full keys are only shown once, at creation — the snippet below uses a{' '}
              <code className="rounded bg-muted px-1 py-0.5">&lt;YOUR_API_KEY&gt;</code> placeholder
              for this existing key. Create a fresh key to have it filled in automatically.
            </p>
          )}
        </div>
      )}

      {createdKey?.key && selectedIsCreated && (
        <div className="space-y-2 rounded-md border border-secondary/40 bg-secondary/10 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <AlertTriangle className="h-4 w-4" />
            Copy this key now &mdash; it is shown only once
          </div>
          <CopyField value={createdKey.key} />
          <p className="text-xs text-muted-foreground">
            The snippet below is pre-filled with this key while you stay on this page.
          </p>
        </div>
      )}

      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 text-xs leading-relaxed">
          <code>{claudeSnippet}</code>
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton text={claudeSnippet} label="Copy JSON" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Manage all keys in the{' '}
        <a href="#api-keys" className="text-secondary hover:underline">
          API keys
        </a>{' '}
        section at the bottom of the page.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup steps with {{HOOK_URL}} / {{API_KEY}} substitution
// ---------------------------------------------------------------------------

function renderStep(step: string, hookUrl: string | null, apiKey: string | null): ReactNode[] {
  const parts = step.split(/(\{\{HOOK_URL\}\}|\{\{API_KEY\}\})/g);
  return parts.map((part, i) => {
    if (part === '{{HOOK_URL}}') {
      return (
        <code key={i} className="break-all rounded bg-muted px-1 py-0.5 text-xs">
          {hookUrl ?? 'your hook URL'}
        </code>
      );
    }
    if (part === '{{API_KEY}}') {
      return (
        <code key={i} className="break-all rounded bg-muted px-1 py-0.5 text-xs">
          {apiKey ?? '<YOUR_API_KEY>'}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function SetupSteps({
  provider,
  hookUrl,
  apiKey,
}: {
  provider: IntegrationProvider;
  hookUrl: string | null;
  apiKey: string | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Setup</p>
      <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
        {provider.setup.map((step, i) => (
          <li key={i}>{renderStep(step, hookUrl, apiKey)}</li>
        ))}
      </ol>
      {provider.notes && (
        <p className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          {provider.notes}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advanced Mode rule editor
// ---------------------------------------------------------------------------

interface RuleRow {
  event: string;
  /** Known state name or CUSTOM_STATE sentinel. */
  stateSel: string;
  customState: string;
  ttl: string; // empty = no TTL
  enabled: boolean;
}

function toRuleRow(rule: TriggerRule): RuleRow {
  const known = (KNOWN_STATES as readonly string[]).includes(rule.state);
  return {
    event: rule.event,
    stateSel: known ? rule.state : CUSTOM_STATE,
    customState: known ? '' : rule.state,
    ttl: rule.ttlMs != null ? String(rule.ttlMs) : '',
    enabled: rule.enabled,
  };
}

function fromRuleRow(row: RuleRow): TriggerRule {
  const state = row.stateSel === CUSTOM_STATE ? row.customState.trim() : row.stateSel;
  const ttlNum = row.ttl.trim() === '' ? undefined : Number(row.ttl);
  return {
    event: row.event.trim(),
    state,
    ...(ttlNum != null && Number.isFinite(ttlNum) && ttlNum > 0 ? { ttlMs: ttlNum } : {}),
    enabled: row.enabled,
  };
}

function rowState(row: RuleRow): string {
  return row.stateSel === CUSTOM_STATE ? row.customState.trim() : row.stateSel;
}

function RuleEditor({
  instance,
  provider,
  onSaved,
  onError,
}: {
  instance: IntegrationInstance;
  provider: IntegrationProvider;
  onSaved: (instance: IntegrationInstance) => void;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<RuleRow[]>(() => instance.rules.map(toRuleRow));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const updateRow = (index: number, patch: Partial<RuleRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSavedFlash(false);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSavedFlash(false);
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { event: '', stateSel: 'claude-attention', customState: '', ttl: '', enabled: true },
    ]);
    setSavedFlash(false);
  };

  const handleSave = async () => {
    // Rows that were added but never touched shouldn't block saving —
    // silently drop them. Only a PARTIALLY filled row is a real mistake.
    const meaningful = rows.filter(
      (row) => row.event.trim() !== '' || (row.stateSel === CUSTOM_STATE && row.customState.trim() !== '')
    );

    for (let i = 0; i < meaningful.length; i++) {
      const row = meaningful[i];
      if (!row.event.trim()) {
        onError(`Rule ${i + 1} needs an event pattern (the name your provider sends, e.g. "${provider.eventExamples[0] ?? 'my-event'}").`);
        return;
      }
      if (!rowState(row)) {
        onError(`Rule ${i + 1} ("${row.event.trim()}") needs a state — pick one from the list or type a custom state name.`);
        return;
      }
    }
    setSaving(true);
    try {
      const updated = await integrationsApi.update(instance.id, {
        rules: meaningful.map(fromRuleRow),
      });
      onSaved(updated);
      setRows(updated.rules.map(toRuleRow));
      setSavedFlash(true);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to save rules'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">
        First matching rule wins. A disabled matching rule silences the event. Event patterns
        support exact match plus trailing wildcards:{' '}
        <code className="rounded bg-muted px-1 py-0.5">workflow_run.*</code> or{' '}
        <code className="rounded bg-muted px-1 py-0.5">*</code> (any event).
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules — every event is ignored.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const state = rowState(row);
            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-2"
              >
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                  title={row.enabled ? 'Rule enabled' : 'Rule disabled (silences matching events)'}
                />
                <Input
                  value={row.event}
                  onChange={(e) => updateRow(i, { event: e.target.value })}
                  placeholder={provider.eventExamples[i % provider.eventExamples.length] ?? 'event-name'}
                  className="h-8 min-w-36 flex-1 font-mono text-xs"
                  aria-label="Event pattern"
                />
                <span className="text-xs text-muted-foreground">&rarr;</span>
                <div className="flex items-center gap-2">
                  <StateDot state={state} />
                  <select
                    value={row.stateSel}
                    onChange={(e) => updateRow(i, { stateSel: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Beacon state"
                  >
                    {KNOWN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value={CUSTOM_STATE}>custom&hellip;</option>
                  </select>
                  {row.stateSel === CUSTOM_STATE && (
                    <Input
                      value={row.customState}
                      onChange={(e) => updateRow(i, { customState: e.target.value })}
                      placeholder="custom-state"
                      className="h-8 w-28 font-mono text-xs"
                      aria-label="Custom state"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    step={500}
                    value={row.ttl}
                    onChange={(e) => updateRow(i, { ttl: e.target.value })}
                    placeholder="TTL"
                    className="h-8 w-20 text-xs"
                    aria-label="TTL in milliseconds"
                    title="Optional: auto-clear the state after this many milliseconds"
                  />
                  <span className="text-[10px] text-muted-foreground">ms</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeRow(i)} title="Delete rule">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3 w-3" />
          Add rule
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save rules'}
        </Button>
        {savedFlash && <span className="text-xs text-primary">Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instance detail (rendered inside the drawer)
// ---------------------------------------------------------------------------

function InstanceDetail({
  instance,
  provider,
  keys,
  createdKey,
  creatingKey,
  onCreateKey,
  onChanged,
  onDeleted,
  onRefresh,
  onError,
}: {
  instance: IntegrationInstance;
  provider: IntegrationProvider;
  keys: ApiKeySummary[];
  createdKey: ApiKeySummary | null;
  creatingKey: boolean;
  onCreateKey: (label: string) => Promise<void>;
  onChanged: (instance: IntegrationInstance) => void;
  onDeleted: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(instance.name);
  const [advanced, setAdvanced] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hookUrl = instance.hookPath ? hookDisplayUrl(instance.hookPath) : null;
  const isClaudeCode = provider.id === 'claude-code';
  const snippetApiKey = isClaudeCode ? (createdKey?.key ?? null) : null;

  const toggleEnabled = async () => {
    setBusy(true);
    try {
      onChanged(await integrationsApi.update(instance.id, { enabled: !instance.enabled }));
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to update integration'));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name || name === instance.name) {
      setRenaming(false);
      setNameDraft(instance.name);
      return;
    }
    setBusy(true);
    try {
      onChanged(await integrationsApi.update(instance.id, { name }));
      setRenaming(false);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to rename integration'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Disconnect "${instance.name}"? Its hook URL and rules will stop working immediately.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await integrationsApi.remove(instance.id);
      onDeleted(instance.id);
    } catch (error) {
      onError(apiErrorMessage(error, 'Failed to delete integration'));
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Plug className="h-4 w-4 text-primary" />
          </div>
          {renaming ? (
            <form onSubmit={handleRename} className="flex flex-1 items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-8 max-w-56 text-sm"
                maxLength={64}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={busy}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenaming(false);
                  setNameDraft(instance.name);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium">{instance.name}</p>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="text-muted-foreground hover:text-foreground"
                title="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Enabled toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={instance.enabled}
          onClick={toggleEnabled}
          disabled={busy}
          className={
            'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ' +
            (instance.enabled ? 'bg-primary' : 'bg-muted')
          }
          title={instance.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        >
          <span
            className={
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ' +
              (instance.enabled ? 'left-[22px]' : 'left-0.5')
            }
          />
        </button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={busy} title="Disconnect">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="space-y-5 p-4">
        {/* Hook URL */}
        {hookUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your hook URL</p>
            <CopyField value={hookUrl} />
            <p className="text-xs text-muted-foreground">
              Unique to this connection &mdash; anyone with the URL can trigger it, so treat it like
              a secret.
            </p>
          </div>
        )}

        {/* Setup */}
        <SetupSteps provider={provider} hookUrl={hookUrl} apiKey={snippetApiKey} />

        {/* Claude Code: self-sufficient key + snippet flow */}
        {isClaudeCode && (
          <ClaudeSnippetSection
            keys={keys}
            createdKey={createdKey}
            creating={creatingKey}
            onCreateKey={onCreateKey}
          />
        )}

        {/* Delivery status */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
          {instance.lastEvent && instance.lastEventAt ? (
            <span>
              Last event: <code className="rounded bg-muted px-1 py-0.5">{instance.lastEvent}</code>{' '}
              &middot; {relativeTime(instance.lastEventAt)} &middot; {instance.eventCount} total
            </span>
          ) : (
            <span>No events received yet &mdash; send a test from the provider.</span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="Refresh delivery status"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Triggers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Triggers</p>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-secondary hover:underline"
            >
              {advanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Advanced Mode
            </button>
          </div>

          {!advanced &&
            (instance.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rules yet &mdash; open Advanced Mode to map this provider's events to beacon
                states.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {instance.rules.map((rule, i) => (
                  <span
                    key={i}
                    className={
                      'inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs ' +
                      (rule.enabled ? '' : 'opacity-50 line-through')
                    }
                    title={rule.enabled ? undefined : 'Disabled — silences matching events'}
                  >
                    <code>{rule.event}</code>
                    <span className="text-muted-foreground">&rarr;</span>
                    <StateDot state={rule.state} />
                    <span>{rule.state}</span>
                    {rule.ttlMs != null && (
                      <span className="text-muted-foreground">
                        ({(rule.ttlMs / 1000).toFixed(rule.ttlMs % 1000 === 0 ? 0 : 1)}s)
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ))}

          {advanced && (
            <RuleEditor
              instance={instance}
              provider={provider}
              onSaved={onChanged}
              onError={onError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide-over drawer
// ---------------------------------------------------------------------------

function Drawer({
  title,
  badge,
  onClose,
  children,
}: {
  title: string;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} data-testid="drawer-backdrop" />
      {/* Panel */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {badge}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
            data-testid="drawer-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directory card
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  instanceCount,
  onOpen,
}: {
  provider: IntegrationProvider;
  instanceCount: number;
  onOpen: () => void;
}) {
  const isLocal = provider.kind === 'local';

  return (
    <Card
      className="flex h-full cursor-pointer flex-col transition-colors hover:border-primary/50"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{provider.name}</p>
          <KindBadge kind={provider.kind} />
        </div>
        <p className="text-xs text-muted-foreground">{provider.tagline}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2 text-xs">
          {isLocal ? (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">Always on via the desktop app</span>
            </>
          ) : instanceCount > 0 ? (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-primary" />
              <span className="text-primary">
                Connected{instanceCount > 1 ? ` · ${instanceCount}` : ''}
              </span>
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
              <span className="text-muted-foreground">Not connected</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Marketplace filters
// ---------------------------------------------------------------------------

type FilterChip = 'all' | 'connected' | 'webhook' | 'hooks' | 'local';

const FILTER_CHIPS: Array<{ id: FilterChip; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'webhook', label: 'Webhooks' },
  { id: 'hooks', label: 'Command hooks' },
  { id: 'local', label: 'Built-in' },
];

// ---------------------------------------------------------------------------
// API keys section (page bottom)
// ---------------------------------------------------------------------------

function ApiKeysSection({
  keys,
  loading,
  createdKey,
  onCreate,
  onDelete,
  creating,
}: {
  keys: ApiKeySummary[];
  loading: boolean;
  createdKey: ApiKeySummary | null;
  onCreate: (label: string) => Promise<void>;
  onDelete: (key: ApiKeySummary) => Promise<void>;
  creating: boolean;
}) {
  const [newLabel, setNewLabel] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await onCreate(newLabel.trim());
    setNewLabel('');
  };

  return (
    <section id="api-keys" className="scroll-mt-8">
      <h2 className="mb-1 text-lg font-semibold">API keys</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Keys authenticate command-hook integrations (like Claude Code) and your own scripts against
        POST {apiDisplayOrigin()}/api/beacon.
      </p>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1">
              <label htmlFor="key-label" className="text-xs font-medium text-muted-foreground">
                Label
              </label>
              <Input
                id="key-label"
                placeholder="e.g. Claude Code on my laptop"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                required
                maxLength={64}
              />
            </div>
            <Button type="submit" disabled={creating}>
              <KeyRound className="mr-2 h-4 w-4" />
              {creating ? 'Creating...' : 'Create key'}
            </Button>
          </form>

          {createdKey?.key && (
            <div className="space-y-2 rounded-md border border-secondary/40 bg-secondary/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                <AlertTriangle className="h-4 w-4" />
                Copy this key now &mdash; it is shown only once
              </div>
              <CopyField value={createdKey.key} />
              <p className="text-xs text-muted-foreground">
                The Claude Code snippet is pre-filled with this key while you stay on this page.
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading keys...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys yet. Create one to connect Claude Code or your own scripts.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{key.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {key.prefix}
                      {'…'} · created {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(key)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Integrations page
// ---------------------------------------------------------------------------

export function Integrations() {
  const [instances, setInstances] = useState<IntegrationInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [drawerProviderId, setDrawerProviderId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Marketplace filters
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<FilterChip>('all');

  // API keys (shared between the drawer's Claude Code flow and the bottom section)
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [creatingKey, setCreatingKey] = useState(false);
  /** Full secret of the key created this session — the only time we have it. */
  const [createdKey, setCreatedKey] = useState<ApiKeySummary | null>(null);

  const loadInstances = useCallback(async () => {
    try {
      setInstances(await integrationsApi.list());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load integrations'));
    } finally {
      setLoadingInstances(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await keysApi.list());
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load API keys'));
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    loadInstances();
    loadKeys();
  }, [loadInstances, loadKeys]);

  const instancesByProvider = useMemo(() => {
    const map = new Map<string, IntegrationInstance[]>();
    for (const inst of instances) {
      const list = map.get(inst.providerId) ?? [];
      list.push(inst);
      map.set(inst.providerId, list);
    }
    return map;
  }, [instances]);

  const visibleProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return INTEGRATION_CATALOG.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.tagline.toLowerCase().includes(q)) {
        return false;
      }
      switch (chip) {
        case 'connected':
          return (instancesByProvider.get(p.id)?.length ?? 0) > 0;
        case 'webhook':
        case 'hooks':
        case 'local':
          return p.kind === chip;
        default:
          return true;
      }
    });
  }, [search, chip, instancesByProvider]);

  const drawerProvider = drawerProviderId
    ? INTEGRATION_CATALOG.find((p) => p.id === drawerProviderId) ?? null
    : null;
  const drawerInstances = drawerProviderId
    ? instancesByProvider.get(drawerProviderId) ?? []
    : [];

  const closeDrawer = useCallback(() => setDrawerProviderId(null), []);

  const handleConnect = async (provider: IntegrationProvider) => {
    setConnectingId(provider.id);
    setError(null);
    try {
      const instance = await integrationsApi.create(provider.id);
      setInstances((prev) => [...prev, instance]);
      setDrawerProviderId(provider.id);
    } catch (err) {
      setError(apiErrorMessage(err, `Failed to connect ${provider.name}`));
    } finally {
      setConnectingId(null);
    }
  };

  const handleInstanceChanged = (instance: IntegrationInstance) => {
    setInstances((prev) => prev.map((i) => (i.id === instance.id ? instance : i)));
  };

  const handleInstanceDeleted = (id: string) => {
    setInstances((prev) => prev.filter((i) => i.id !== id));
  };

  const handleCreateKey = async (label: string) => {
    setCreatingKey(true);
    setError(null);
    try {
      const key = await keysApi.create(label);
      setCreatedKey(key);
      setKeys((prev) => [...prev, { ...key, key: undefined }]);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create API key'));
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (key: ApiKeySummary) => {
    if (!window.confirm(`Delete key "${key.label}"? Integrations using it will stop working.`)) {
      return;
    }
    try {
      await keysApi.remove(key.id);
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      if (createdKey?.id === key.id) setCreatedKey(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete API key'));
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect the tools you use and map their events to beacon states on your lights
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Search + filter chips */}
      <div className="mb-5 space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="pl-9"
            aria-label="Search integrations"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                (chip === c.id
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground')
              }
              aria-pressed={chip === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Directory grid */}
      <section className="mb-8">
        {visibleProviders.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No integrations match your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                instanceCount={instancesByProvider.get(provider.id)?.length ?? 0}
                onOpen={() => setDrawerProviderId(provider.id)}
              />
            ))}
          </div>
        )}
        {loadingInstances && (
          <p className="mt-3 text-sm text-muted-foreground">Loading your connections...</p>
        )}
      </section>

      <ApiKeysSection
        keys={keys}
        loading={loadingKeys}
        createdKey={createdKey}
        onCreate={handleCreateKey}
        onDelete={handleDeleteKey}
        creating={creatingKey}
      />

      {/* Slide-over drawer with everything about the selected provider */}
      {drawerProvider && (
        <Drawer
          title={drawerProvider.name}
          badge={<KindBadge kind={drawerProvider.kind} />}
          onClose={closeDrawer}
        >
          <p className="text-sm text-muted-foreground">{drawerProvider.description}</p>

          {drawerProvider.kind === 'local' ? (
            <>
              <p className="rounded-md border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                Built-in &mdash; always on via the desktop app. Nothing to connect here.
              </p>
              <SetupSteps provider={drawerProvider} hookUrl={null} apiKey={null} />
            </>
          ) : drawerInstances.length === 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/50 p-4">
                <p className="text-sm text-muted-foreground">
                  Not connected yet. Connecting creates your unique setup
                  {drawerProvider.defaultRules.length > 0
                    ? ' with sensible default triggers.'
                    : '.'}
                </p>
                <Button
                  onClick={() => handleConnect(drawerProvider)}
                  disabled={connectingId === drawerProvider.id}
                >
                  <Plug className="mr-2 h-4 w-4" />
                  {connectingId === drawerProvider.id ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
              <SetupSteps provider={drawerProvider} hookUrl={null} apiKey={null} />
            </>
          ) : (
            <>
              {drawerInstances.map((instance) => (
                <InstanceDetail
                  key={instance.id}
                  instance={instance}
                  provider={drawerProvider}
                  keys={keys}
                  createdKey={createdKey}
                  creatingKey={creatingKey}
                  onCreateKey={handleCreateKey}
                  onChanged={handleInstanceChanged}
                  onDeleted={handleInstanceDeleted}
                  onRefresh={loadInstances}
                  onError={setError}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConnect(drawerProvider)}
                disabled={connectingId === drawerProvider.id}
              >
                <Plus className="mr-1 h-3 w-3" />
                {connectingId === drawerProvider.id ? 'Connecting...' : 'Connect another'}
              </Button>
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}

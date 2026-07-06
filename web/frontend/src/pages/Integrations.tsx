import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AlertTriangle, Check, Copy, KeyRound, Terminal, Trash2 } from 'lucide-react';
import { apiErrorMessage, keysApi } from '../lib/beacon';
import type { ApiKeySummary } from '../../../shared/protocol';

const BEACON_URL = 'http://localhost:3001/api/beacon';

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

function buildClaudeHooksSnippet(key: string): string {
  const curl = (payload: Record<string, unknown>) =>
    `curl.exe -s -X POST ${BEACON_URL} -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d "${JSON.stringify(payload).replace(/"/g, '\\"')}"`;

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

function buildGenericCurl(key: string): string {
  return [
    `curl -X POST ${BEACON_URL} \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"state":"claude-working","ttlMs":10000,"source":"my-script"}'`,
  ].join('\n');
}

export function Integrations() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  /** Full secret of the key created this session — the only time we have it. */
  const [createdKey, setCreatedKey] = useState<ApiKeySummary | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys(await keysApi.list());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load API keys'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const key = await keysApi.create(newLabel.trim());
      setCreatedKey(key);
      setKeys((prev) => [...prev, { ...key, key: undefined }]);
      setNewLabel('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create API key'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (key: ApiKeySummary) => {
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

  const snippetKey = createdKey?.key ?? '<YOUR_API_KEY>';
  const claudeSnippet = buildClaudeHooksSnippet(snippetKey);
  const genericCurl = buildGenericCurl(snippetKey);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          API keys let external tools trigger beacon states on your lights
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* API keys */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">API keys</CardTitle>
          <CardDescription>
            Send POST {BEACON_URL} with an API key to set a beacon state from anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                Copy this key now — it is shown only once
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={createdKey.key} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <CopyButton text={createdKey.key} />
              </div>
              <p className="text-xs text-muted-foreground">
                The snippets below are pre-filled with this key while you stay on this page.
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
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claude Code integration */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-secondary" />
            Claude Code
          </CardTitle>
          <CardDescription>
            Make your lights react to Claude Code: purple when Claude needs your attention, a
            green flash when it finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>Create an API key above (the snippet fills in automatically).</li>
            <li>
              Paste this into <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.claude/settings.json</code>{' '}
              (merge with any existing <code className="rounded bg-muted px-1 py-0.5 text-xs">hooks</code> section).
            </li>
            <li>
              Done — <span className="text-secondary">claude-attention</span> turns the light purple
              until you respond, and <span className="text-primary">claude-done</span> flashes green
              for 4 seconds before falling back to your Discord state.
            </li>
          </ol>
          {!createdKey?.key && (
            <p className="text-xs text-muted-foreground">
              Note: replace <code className="rounded bg-muted px-1 py-0.5">&lt;YOUR_API_KEY&gt;</code>{' '}
              with a real key — existing keys can't be shown again, so create a new one if needed.
            </p>
          )}
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 text-xs leading-relaxed">
              <code>{claudeSnippet}</code>
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={claudeSnippet} label="Copy JSON" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generic integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Anything else</CardTitle>
          <CardDescription>
            Any tool that can make an HTTP request can drive your beacon. Send{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">state</code> (any string; known
            states have default colors), an optional{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ttlMs</code> for transient
            states, and a <code className="rounded bg-muted px-1 py-0.5 text-xs">source</code>.
            Send state <code className="rounded bg-muted px-1 py-0.5 text-xs">clear</code> to
            release the override.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 text-xs leading-relaxed">
              <code>{genericCurl}</code>
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={genericCurl} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

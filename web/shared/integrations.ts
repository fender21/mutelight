/**
 * MuteBeacon official integration directory.
 *
 * This is a curated, static catalog: every entry ships with setup
 * instructions and sensible default trigger rules. Instances (a user's
 * connected copy of a provider) live in the database; this file only
 * describes what CAN be connected and how.
 *
 * Used by the dashboard (directory UI + docs) and the backend
 * (per-provider event extraction for inbound webhooks).
 */

import type { TriggerRule } from './protocol';

export type IntegrationKind =
  | 'webhook' // provider POSTs its own payloads to our per-instance hook URL
  | 'hooks' // user installs command hooks that call POST /api/beacon (e.g. Claude Code)
  | 'local'; // runs inside the desktop gateway (Discord) — informational entry

export interface IntegrationProvider {
  id: string;
  name: string;
  kind: IntegrationKind;
  tagline: string;
  description: string;
  /** Ordered, user-facing setup steps. `{{HOOK_URL}}` and `{{API_KEY}}` are substituted by the UI. */
  setup: string[];
  /** Example event names this provider emits, for the Advanced Mode rule editor. */
  eventExamples: string[];
  /** Rules created automatically when the user connects the integration. */
  defaultRules: TriggerRule[];
  /** Optional notes/caveats shown under setup. */
  notes?: string;
}

export const INTEGRATION_CATALOG: IntegrationProvider[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'hooks',
    tagline: 'Light up when Claude needs you or finishes a task',
    description:
      'Claude Code hooks run a command on lifecycle events. The generated settings snippet calls the MuteBeacon trigger endpoint with your API key: Notification fires when Claude needs your input, Stop fires when it finishes.',
    setup: [
      'Create (or reuse) an API key below — the snippet is generated with it pre-filled.',
      'Open ~/.claude/settings.json (create it if missing).',
      'Merge the generated "hooks" block into the file and save.',
      'Run any Claude Code task: your beacon turns purple when Claude needs attention and flashes green when it finishes.',
    ],
    eventExamples: ['claude-attention', 'claude-done', 'claude-working'],
    defaultRules: [
      { event: 'claude-attention', state: 'claude-attention', enabled: true },
      { event: 'claude-done', state: 'claude-done', ttlMs: 4000, enabled: true },
    ],
    notes:
      'This integration calls POST /api/beacon directly (states pass through as events), so rules here simply let you remap or disable states without editing your hooks.',
  },
  {
    id: 'github',
    name: 'GitHub',
    kind: 'webhook',
    tagline: 'CI results, PR reviews, and issues on your beacon',
    description:
      'GitHub repository or organization webhooks POST events like workflow runs, pull request reviews, and issues to your hook URL. Events are named "<event>.<action>", e.g. workflow_run.completed or pull_request.opened.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In GitHub, open your repository → Settings → Webhooks → Add webhook.',
      'Paste your hook URL into "Payload URL" and set Content type to application/json.',
      'Choose "Let me select individual events" and pick the ones you care about (e.g. Workflow runs, Pull requests).',
      'Save. GitHub sends a ping event immediately — your beacon setup is confirmed when it shows as delivered.',
    ],
    eventExamples: ['workflow_run.completed', 'pull_request.opened', 'pull_request_review.submitted', 'issues.opened', 'push'],
    defaultRules: [
      { event: 'workflow_run.completed', state: 'claude-done', ttlMs: 5000, enabled: true },
      { event: 'pull_request_review.submitted', state: 'claude-attention', ttlMs: 10000, enabled: true },
    ],
    notes:
      'Tip: use Advanced Mode to route failures differently — e.g. map workflow_run.completed to a red custom state when you mostly care about broken builds.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    kind: 'webhook',
    tagline: 'Flash the lights when money moves',
    description:
      'Stripe webhooks POST event objects whose "type" field becomes the event name, e.g. payment_intent.succeeded or invoice.payment_failed.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In the Stripe Dashboard, go to Developers → Webhooks → Add endpoint.',
      'Paste your hook URL as the endpoint URL.',
      'Select the events to send (e.g. payment_intent.succeeded, invoice.payment_failed).',
      'Add the endpoint. Use "Send test webhook" to see your beacon react immediately.',
    ],
    eventExamples: ['payment_intent.succeeded', 'invoice.payment_failed', 'customer.subscription.created', 'charge.refunded'],
    defaultRules: [
      { event: 'payment_intent.succeeded', state: 'claude-done', ttlMs: 4000, enabled: true },
      { event: 'invoice.payment_failed', state: 'claude-attention', ttlMs: 15000, enabled: true },
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    kind: 'webhook',
    tagline: 'New orders light up the room',
    description:
      'Shopify sends webhooks for store events. The event name comes from the X-Shopify-Topic header, e.g. orders/create or products/update.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In Shopify admin, go to Settings → Notifications → Webhooks → Create webhook.',
      'Pick an event (e.g. Order creation), format JSON, and paste your hook URL.',
      'Save. Use "Send test notification" to verify your beacon reacts.',
    ],
    eventExamples: ['orders/create', 'orders/paid', 'products/update', 'customers/create'],
    defaultRules: [
      { event: 'orders/create', state: 'claude-done', ttlMs: 6000, enabled: true },
    ],
  },
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    kind: 'webhook',
    tagline: 'Bridge your smart home into the beacon',
    description:
      'Use a Home Assistant automation with the RESTful Command or webhook action to POST JSON to your hook URL. Include an "event" field to name the trigger.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In Home Assistant, create an automation with your desired trigger (door opens, alarm arms, etc.).',
      'Add a "Call service" action using rest_command (or a Webhook node in Node-RED).',
      'POST JSON to your hook URL with a body like {"event": "front-door-open"}.',
      'Add a matching rule in Advanced Mode mapping "front-door-open" to a beacon state.',
    ],
    eventExamples: ['front-door-open', 'alarm-armed', 'washer-done'],
    defaultRules: [],
    notes: 'Home Assistant events are whatever you name them — add rules in Advanced Mode for each event string you send.',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    kind: 'webhook',
    tagline: 'Connect 6000+ apps through one hook URL',
    description:
      'Use Zapier\'s "Webhooks by Zapier" action as the last step of any Zap. POST JSON with an "event" field to your hook URL and map it to a state.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In Zapier, create a Zap with any trigger (new email, calendar event, CRM update…).',
      'Add an action step: Webhooks by Zapier → POST.',
      'Set the URL to your hook URL, Payload Type json, and add a data field: event = your-event-name.',
      'Turn the Zap on, then add a rule in Advanced Mode mapping that event to a beacon state.',
    ],
    eventExamples: ['new-lead', 'meeting-starting', 'form-submitted'],
    defaultRules: [],
  },
  {
    id: 'ifttt',
    name: 'IFTTT',
    kind: 'webhook',
    tagline: 'If This, Then Beacon',
    description:
      'Use the IFTTT "Webhooks" service (Make a web request) as the "Then" of any applet. POST JSON with an "event" field to your hook URL.',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'In IFTTT, create an applet with any trigger.',
      'For the action, choose Webhooks → Make a web request.',
      'Set URL to your hook URL, Method POST, Content Type application/json, Body {"event": "your-event-name"}.',
      'Save, then add a rule in Advanced Mode mapping that event to a beacon state.',
    ],
    eventExamples: ['phone-battery-low', 'weather-rain', 'timer-done'],
    defaultRules: [],
  },
  {
    id: 'generic-webhook',
    name: 'Generic Webhook',
    kind: 'webhook',
    tagline: 'Anything that can POST JSON can drive your beacon',
    description:
      'The universal escape hatch: POST JSON to your hook URL from curl, CI pipelines, cron jobs, monitoring tools — anything. The event name is read from the "event" field (falling back to "state" or "type").',
    setup: [
      'Connect this integration to get your unique hook URL.',
      'POST to it from anywhere: curl -X POST <your hook URL> -H "Content-Type: application/json" -d \'{"event": "deploy-finished"}\'',
      'Add rules in Advanced Mode mapping your event names to beacon states.',
    ],
    eventExamples: ['deploy-finished', 'backup-failed', 'on-call-page'],
    defaultRules: [],
  },
  {
    id: 'discord',
    name: 'Discord (built-in)',
    kind: 'local',
    tagline: 'Voice mute/deafen detection — runs on your computer',
    description:
      'Discord voice state is the one integration that runs inside the desktop app, because Discord RPC only works locally. It is always available once the desktop client is running and authorized — nothing to connect here.',
    setup: [
      'Install and pair the MuteBeacon desktop app.',
      'Have Discord desktop running; approve the authorization popup on first run.',
      'Join a voice channel — mute, deafen, streaming, and speaking states drive your lights automatically.',
    ],
    eventExamples: ['muted', 'deafened', 'connected', 'speaking', 'streaming'],
    defaultRules: [],
    notes: 'State colors for Discord are configured per-device on the Devices page.',
  },
];

export function getProvider(id: string): IntegrationProvider | undefined {
  return INTEGRATION_CATALOG.find(p => p.id === id);
}

/**
 * Match an incoming event name against a rule pattern.
 * Supports exact match and a trailing wildcard: "workflow_run.*" or "*".
 */
export function eventMatches(pattern: string, event: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    return event.startsWith(pattern.slice(0, -1)); // keep the dot: "workflow_run."
  }
  return pattern === event;
}

/* E2E test: simulates the desktop gateway against the running backend.
 * Run from web/backend so `ws` resolves: node <path>/e2e-gateway.js
 */
const WebSocket = require('ws');

const API = 'http://localhost:3001';
const WS = 'ws://localhost:3002';
const EMAIL = 'gregg@test.com';
const PASSWORD = 'password123';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`);
  }
}

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function waitForMessage(ws, type, timeoutMs = 8000, predicate = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for '${type}'`)),
      timeoutMs
    );
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type && (!predicate || predicate(msg))) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

async function main() {
  console.log('1. Login (register if needed)');
  let login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) {
    await api('POST', '/api/auth/register', { email: EMAIL, password: PASSWORD });
    login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  }
  const jwt = login.json?.data?.accessToken;
  check('login returns access token', !!jwt, login.json);

  console.log('2. Pairing: gateway starts, user claims, gateway polls');
  const start = await api('POST', '/api/pair/start');
  const { code, pollToken } = start.json.data;
  check('pair/start returns code', /^[A-Z2-9]{6}$/.test(code), start.json);

  const claim = await api('POST', '/api/pair/claim', { code, name: 'E2E Test PC' }, jwt);
  check('pair/claim creates gateway', claim.status === 201 && claim.json.data.gateway.id, claim.json);
  const gatewayId = claim.json.data.gateway.id;

  const poll = await api('GET', `/api/pair/poll?token=${pollToken}`);
  const deviceToken = poll.json.data.deviceToken;
  check('pair/poll delivers device token', poll.json.data.claimed && !!deviceToken, poll.json);

  const poll2 = await api('GET', `/api/pair/poll?token=${pollToken}`);
  check('device token delivered only once', poll2.json.data.claimed === false, poll2.json);

  console.log('3. Gateway connects over WS and authenticates');
  const gw = new WebSocket(WS);
  await new Promise((r) => gw.on('open', r));
  const authP = waitForMessage(gw, 'auth_success');
  const configP = waitForMessage(gw, 'config_sync');
  gw.send(JSON.stringify({ type: 'device_auth', deviceToken }));
  const auth = await authP;
  check('gateway auth_success', auth.payload.deviceId === gatewayId, auth);
  const initialConfig = await configP;
  check('config_sync pushed on connect', Array.isArray(initialConfig.payload.devices), initialConfig);

  console.log('4. Gateway streams a discovered WLED device');
  gw.send(
    JSON.stringify({
      type: 'discovery_result',
      payload: { devices: [{ name: 'Desk Strip', ip: '192.168.1.50', port: 80 }] },
    })
  );
  await new Promise((r) => setTimeout(r, 300));
  const devList = await api('GET', '/api/devices', null, jwt);
  check(
    'discovered device visible in dashboard API',
    devList.json.data.discovered.some((d) => d.ip === '192.168.1.50'),
    devList.json.data
  );

  console.log('5. User adds the device -> gateway receives config_sync');
  const configP2 = waitForMessage(gw, 'config_sync');
  const created = await api(
    'POST',
    '/api/devices',
    {
      name: 'Desk Strip',
      ip_address: '192.168.1.50',
      stateColors: { muted: { color: '#ff0000', brightness: 200, enabled: true } },
    },
    jwt
  );
  check('device created', created.status === 201, created.json);
  const sync = await configP2;
  check(
    'config_sync carries the new device',
    sync.payload.devices.some((d) => d.ip_address === '192.168.1.50'),
    sync.payload
  );

  console.log('6. API key + beacon trigger -> gateway receives beacon');
  const keyRes = await api('POST', '/api/keys', { label: 'E2E key' }, jwt);
  const apiKey = keyRes.json.data.key.key;
  check('api key created with mb_ prefix', apiKey?.startsWith('mb_'), keyRes.json);

  const beaconP = waitForMessage(gw, 'beacon');
  const fire = await api('POST', '/api/beacon', { state: 'claude-attention', source: 'claude' }, apiKey);
  check('beacon accepted, delivered>=1', fire.json.data.delivered >= 1, fire.json);
  const beacon = await beaconP;
  check('gateway received beacon claude-attention', beacon.payload.state === 'claude-attention', beacon);

  const badFire = await api('POST', '/api/beacon', { state: 'x' }, 'mb_bogus');
  check('bogus API key rejected (401)', badFire.status === 401, badFire);

  console.log('7. Test flash command routed to gateway');
  const cmdP = waitForMessage(gw, 'command');
  const test = await api('POST', `/api/devices/${created.json.data.device.id}/test`, {}, jwt);
  check('test endpoint reports sent', test.json.data.sent === true, test.json);
  const cmd = await cmdP;
  check('gateway received test_flash', cmd.payload.action === 'test_flash' && cmd.payload.ip_address === '192.168.1.50', cmd);

  console.log('8. Dashboard session receives live gateway updates');
  const dash = new WebSocket(WS);
  await new Promise((r) => dash.on('open', r));
  const dashAuthP = waitForMessage(dash, 'auth_success');
  // Catch-up snapshots arrive for EVERY online gateway; wait for ours
  const liveP = waitForMessage(dash, 'gateway_update', 8000, (m) => m.payload.gatewayId === gatewayId);
  dash.send(JSON.stringify({ type: 'auth', token: jwt }));
  await dashAuthP;
  const live = await liveP;
  check('dashboard gets gateway_update snapshot', live.payload.gatewayId === gatewayId && live.payload.online, live);

  const liveStatusP = waitForMessage(
    dash,
    'gateway_update',
    8000,
    (m) => m.payload.gatewayId === gatewayId && m.payload.status?.effectiveState === 'muted'
  );
  gw.send(
    JSON.stringify({
      type: 'status',
      payload: { discordConnected: true, effectiveState: 'muted', version: '1.0.0', wledDevices: [] },
    })
  );
  const liveStatus = await liveStatusP;
  check(
    'dashboard sees live status (muted)',
    liveStatus.payload.status?.effectiveState === 'muted',
    liveStatus
  );

  console.log('9. Gateways list shows online');
  const gws = await api('GET', '/api/gateways', null, jwt);
  const g = gws.json.data.gateways.find((x) => x.id === gatewayId);
  check('gateway listed online', g && g.online === true, gws.json.data);

  console.log('10. Integration directory: webhook -> rule -> beacon');
  const intRes = await api('POST', '/api/integrations', { providerId: 'github', name: 'E2E GitHub' }, jwt);
  const integration = intRes.json?.data?.integration;
  check('github integration created with hook URL + default rules',
    intRes.status === 201 && integration.hookPath && integration.rules.length >= 2, intRes.json);

  const hookUrl = `${API}${integration.hookPath}`;
  const beaconP2 = waitForMessage(gw, 'beacon', 8000, (m) => m.payload.source === 'github');
  const hookRes = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'workflow_run' },
    body: JSON.stringify({ action: 'completed', workflow_run: { conclusion: 'success' } }),
  });
  const hookJson = await hookRes.json();
  check('github webhook matched default rule', hookJson.data?.matched === true && hookJson.data?.delivered >= 1, hookJson);
  const ghBeacon = await beaconP2;
  check('gateway received webhook-triggered beacon', ghBeacon.payload.state === 'claude-done' && ghBeacon.payload.source === 'github', ghBeacon);

  const missRes = await fetch(hookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'watch' },
    body: JSON.stringify({ action: 'started' }),
  });
  const missJson = await missRes.json();
  check('unmatched event recorded but not fired', missJson.data?.matched === false, missJson);

  const bogus = await fetch(`${API}/api/hook/nope`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('bogus hook token -> 404', bogus.status === 404, bogus.status);

  const updated = await api('PUT', `/api/integrations/${integration.id}`, {
    rules: [{ event: 'workflow_run.*', state: 'streaming', ttlMs: 2000, enabled: true }],
  }, jwt);
  check('rules editable (Advanced Mode persistence)',
    updated.json?.data?.integration?.rules?.[0]?.state === 'streaming', updated.json);

  const beaconP3 = waitForMessage(gw, 'beacon', 8000, (m) => m.payload.source === 'github' && m.payload.state === 'streaming');
  await fetch(hookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'workflow_run' },
    body: JSON.stringify({ action: 'requested' }),
  });
  const wildBeacon = await beaconP3;
  check('wildcard rule (workflow_run.*) fires remapped state', wildBeacon.payload.state === 'streaming', wildBeacon);

  await api('DELETE', `/api/integrations/${integration.id}`, null, jwt);
  const afterDelete = await fetch(hookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('deleted integration hook -> 404 (token revoked)', afterDelete.status === 404, afterDelete.status);

  gw.close();
  dash.close();
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});

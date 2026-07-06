import { Router, Request } from 'express';
import { integrationService } from '../services/integration.service';
import { wsServer } from '../websocket/server';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Extract a provider-appropriate event name from an inbound webhook.
 * Providers can't be told what shape to send, so we normalize here.
 */
function extractEvent(providerId: string, req: Request): string {
  const payload = (req.body ?? {}) as Record<string, any>;
  switch (providerId) {
    case 'github': {
      const event = String(req.headers['x-github-event'] ?? 'unknown');
      return payload.action ? `${event}.${payload.action}` : event;
    }
    case 'stripe':
      return String(payload.type ?? 'unknown');
    case 'shopify':
      return String(req.headers['x-shopify-topic'] ?? payload.topic ?? 'unknown');
    default:
      // home-assistant, zapier, ifttt, generic-webhook: user-authored bodies
      return String(payload.event ?? payload.state ?? payload.type ?? 'unknown');
  }
}

/**
 * GET /api/hook/:token — humans paste hook URLs into browsers to check
 * them (browsers send GET). Answer with a friendly liveness check and a
 * copyable test command instead of a confusing 404. The token is the
 * credential, so showing instance metadata to its holder is fine.
 */
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const instance = integrationService.getByHookToken(req.params.token);
    if (!instance) {
      res.status(404).json({ success: false, error: 'Unknown hook' });
      return;
    }

    const hookUrl = `${req.protocol}://${req.get('host')}/api/hook/${req.params.token}`;
    res.json({
      success: true,
      data: {
        message:
          'This hook is live! Events must be sent with HTTP POST — opening the URL in a browser sends GET, which cannot carry a payload.',
        integration: instance.name,
        provider: instance.providerId,
        enabled: instance.enabled,
        eventsReceived: instance.eventCount,
        lastEvent: instance.lastEvent,
        testCommand: `curl -X POST ${hookUrl} -H "Content-Type: application/json" -d "{\\"event\\":\\"test\\"}"`,
      },
    });
  })
);

/**
 * POST /api/hook/:token — inbound webhooks from external providers.
 * The token is the credential (unguessable, per-instance, revocable by
 * deleting/recreating the integration). Always returns 200 with a result
 * body so providers don't retry-storm or disable the endpoint.
 */
router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const instance = integrationService.getByHookToken(req.params.token);
    if (!instance) {
      // 404 (not 401) — don't confirm token near-misses exist
      res.status(404).json({ success: false, error: 'Unknown hook' });
      return;
    }

    const event = extractEvent(instance.providerId, req);
    integrationService.recordEvent(instance.id, event);

    if (!instance.enabled) {
      res.json({ success: true, data: { event, matched: false, reason: 'integration disabled' } });
      return;
    }

    const rule = integrationService.matchRule(instance, event);
    if (!rule) {
      res.json({ success: true, data: { event, matched: false } });
      return;
    }

    const delivered = wsServer.sendBeaconToUser(instance.userId, {
      state: rule.state,
      ttlMs: rule.ttlMs,
      source: instance.providerId,
    });
    logger.info(
      `Webhook ${instance.providerId}/${instance.name}: '${event}' -> '${rule.state}' (${delivered} gateway(s))`
    );

    res.json({ success: true, data: { event, matched: true, state: rule.state, delivered } });
  })
);

export default router;

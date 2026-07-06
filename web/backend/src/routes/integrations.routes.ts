import { Router } from 'express';
import { body } from 'express-validator';
import { integrationService } from '../services/integration.service';
import { wsServer } from '../websocket/server';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { integrations: integrationService.list(req.userId!) } });
  })
);

router.post(
  '/',
  validate([body('providerId').isString().isLength({ min: 1, max: 64 })]),
  asyncHandler(async (req, res) => {
    const integration = integrationService.create(req.userId!, req.body.providerId, req.body.name);
    res.status(201).json({ success: true, data: { integration } });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const integration = integrationService.update(req.userId!, req.params.id, req.body);
    res.json({ success: true, data: { integration } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = integrationService.delete(req.userId!, req.params.id);
    if (!deleted) throw new NotFoundError('Integration not found');
    res.json({ success: true });
  })
);

// One-click test: fire a synthetic event through the instance's real
// rules and deliver the resulting beacon to the user's gateways
router.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const instance = integrationService.get(req.userId!, req.params.id);
    if (!instance) throw new NotFoundError('Integration not found');

    if (!instance.enabled) {
      res.json({
        success: true,
        data: { fired: false, reason: 'Integration is disabled — enable it first.' },
      });
      return;
    }

    const test = integrationService.buildTestEvent(instance);
    if (!test) {
      res.json({
        success: true,
        data: { fired: false, reason: 'No enabled rules — add one in Advanced Mode first.' },
      });
      return;
    }

    integrationService.recordEvent(instance.id, `${test.event} (test)`);
    const delivered = wsServer.sendBeaconToUser(req.userId!, {
      state: test.rule.state,
      // Force a TTL so a sticky-state test can't leave the lights stuck
      ttlMs: test.rule.ttlMs ?? 4000,
      source: `${instance.providerId} (test)`,
    });
    logger.info(`Integration test ${instance.providerId}/${instance.name}: '${test.event}' -> '${test.rule.state}' (${delivered} gateway(s))`);

    res.json({
      success: true,
      data: { fired: true, event: test.event, state: test.rule.state, delivered },
    });
  })
);

export default router;

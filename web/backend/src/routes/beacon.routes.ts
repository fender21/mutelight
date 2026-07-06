import { Router } from 'express';
import { body } from 'express-validator';
import { beaconService } from '../services/beacon.service';
import { wsServer } from '../websocket/server';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/beacon — the universal trigger endpoint.
 * Everything that isn't Discord (Claude Code hooks, CI, webhooks, phone
 * shortcuts) fires this with an API key; we push it to the user's gateways.
 * Send state 'clear' to release the trigger and fall back to Discord/manual.
 */
router.post(
  '/',
  validate([
    body('state').isString().isLength({ min: 1, max: 64 }),
    body('ttlMs').optional().isInt({ min: 100, max: 24 * 60 * 60 * 1000 }),
    body('source').optional().isString().isLength({ max: 64 }),
  ]),
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('API key required');
    }
    const userId = beaconService.getUserIdByApiKey(authHeader.substring(7));
    if (!userId) {
      throw new UnauthorizedError('Invalid API key');
    }

    const { state, ttlMs, source } = req.body;
    const delivered = wsServer.sendBeaconToUser(userId, { state, ttlMs, source });
    logger.info(`Beacon '${state}' from '${source ?? 'unknown'}' -> ${delivered} gateway(s)`);

    res.json({ success: true, data: { delivered } });
  })
);

export default router;

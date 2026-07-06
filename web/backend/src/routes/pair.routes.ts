import { Router } from 'express';
import { body, query } from 'express-validator';
import { beaconService } from '../services/beacon.service';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

// Gateway asks for a pairing code to display (unauthenticated by design —
// the code is worthless until a logged-in user claims it)
router.post(
  '/start',
  asyncHandler(async (_req, res) => {
    const data = beaconService.startPairing();
    res.status(201).json({ success: true, data });
  })
);

// Gateway polls until its code has been claimed; delivers the token once
router.get(
  '/poll',
  validate([query('token').notEmpty()]),
  asyncHandler(async (req, res) => {
    const data = beaconService.pollPairing(String(req.query.token));
    res.json({ success: true, data });
  })
);

// Dashboard user claims a code shown on the desktop client
router.post(
  '/claim',
  authenticate,
  validate([body('code').isLength({ min: 4, max: 12 })]),
  asyncHandler(async (req, res) => {
    const { code, name } = req.body;
    const gateway = beaconService.claimPairing(req.userId!, code, name);
    res.status(201).json({ success: true, data: { gateway } });
  })
);

export default router;

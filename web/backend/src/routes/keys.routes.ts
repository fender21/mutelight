import { Router } from 'express';
import { body } from 'express-validator';
import { beaconService } from '../services/beacon.service';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { keys: beaconService.listApiKeys(req.userId!) } });
  })
);

// The full key is returned only from this call — store it client-side
router.post(
  '/',
  validate([body('label').isString().isLength({ min: 1, max: 64 })]),
  asyncHandler(async (req, res) => {
    const key = beaconService.createApiKey(req.userId!, req.body.label);
    res.status(201).json({ success: true, data: { key } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = beaconService.deleteApiKey(req.userId!, req.params.id);
    if (!deleted) throw new NotFoundError('API key not found');
    res.json({ success: true });
  })
);

export default router;

import { Router } from 'express';
import { body } from 'express-validator';
import { integrationService } from '../services/integration.service';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';

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

export default router;

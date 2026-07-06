import { Router } from 'express';
import { beaconService } from '../services/beacon.service';
import { wsServer } from '../websocket/server';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const gateways = beaconService.listGateways(req.userId!).map(g => ({
      ...g,
      online: wsServer.isGatewayOnline(g.id),
    }));
    res.json({ success: true, data: { gateways } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = beaconService.deleteGateway(req.userId!, req.params.id);
    if (!deleted) throw new NotFoundError('Gateway not found');
    res.json({ success: true });
  })
);

export default router;

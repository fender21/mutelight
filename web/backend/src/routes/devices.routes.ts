import { Router } from 'express';
import { body } from 'express-validator';
import { beaconService } from '../services/beacon.service';
import { wsServer } from '../websocket/server';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.use(authenticate);

// Managed devices + the union of everything gateways have discovered on
// their LANs — the dashboard is the single management surface
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        devices: beaconService.listDevices(req.userId!),
        discovered: wsServer.getDiscoveredForUser(req.userId!),
      },
    });
  })
);

router.post(
  '/',
  validate([
    body('name').isString().isLength({ min: 1, max: 64 }),
    body('ip_address').isString().isLength({ min: 7, max: 64 }),
  ]),
  asyncHandler(async (req, res) => {
    const device = beaconService.createDevice(req.userId!, req.body);
    wsServer.pushConfigToUser(req.userId!);
    res.status(201).json({ success: true, data: { device } });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const device = beaconService.updateDevice(req.userId!, req.params.id, req.body);
    wsServer.pushConfigToUser(req.userId!);
    res.json({ success: true, data: { device } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = beaconService.deleteDevice(req.userId!, req.params.id);
    if (!deleted) throw new NotFoundError('Device not found');
    wsServer.pushConfigToUser(req.userId!);
    res.json({ success: true });
  })
);

// Flash the physical device so the user can tell which one it is
router.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const device = beaconService.getDevice(req.userId!, req.params.id);
    if (!device) throw new NotFoundError('Device not found');
    const sent = wsServer.sendCommandToUser(req.userId!, {
      action: 'test_flash',
      deviceId: device.id,
      ip_address: device.ip_address,
      color: req.body?.color ?? '#a855f7',
      brightness: req.body?.brightness ?? 200,
    });
    res.json({ success: true, data: { sent } });
  })
);

export default router;

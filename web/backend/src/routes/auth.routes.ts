import { Router } from 'express';
import { body } from 'express-validator';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

// Register
router.post(
  '/register',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await authService.register(email, password);
    
    res.status(201).json({
      success: true,
      data: { user },
    });
  })
);

// Login
router.post(
  '/login',
  validate([
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const tokens = await authService.login(email, password);
    
    res.json({
      success: true,
      data: tokens,
    });
  })
);

// Refresh tokens
router.post(
  '/refresh',
  validate([
    body('refreshToken').notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    
    res.json({
      success: true,
      data: tokens,
    });
  })
);

// Logout
router.post(
  '/logout',
  validate([
    body('refreshToken').notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    
    res.json({
      success: true,
    });
  })
);

// Get current user
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getUserById(req.userId!);
    
    res.json({
      success: true,
      data: { user },
    });
  })
);

export default router;
# MuteLight Web Platform

This is the web application for MuteLight, consisting of a backend API and React frontend.

## Architecture

- **Backend** - Express.js API with TypeScript, JWT authentication, and WebSocket support
- **Frontend** - React with TypeScript, Vite, Tailwind CSS, and Zustand for state management
- **Shared** - Common TypeScript types used by both backend and frontend

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL (optional, currently using in-memory storage)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend will start on:
- HTTP API: http://localhost:3001
- WebSocket: ws://localhost:3002

Default admin credentials:
- Email: admin@mutelight.app
- Password: changeme123

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on http://localhost:3000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout and invalidate refresh token
- `GET /api/auth/me` - Get current user

### Health Check
- `GET /health` - Server health status

## WebSocket Protocol

Connect to `ws://localhost:3002` and authenticate:

```json
{
  "type": "auth",
  "token": "your-jwt-token"
}
```

Message types:
- `auth` - Authenticate with JWT
- `device_auth` - Authenticate as a device
- `subscribe` - Subscribe to connector updates
- `command` - Send command to device

## Development

### Tech Stack
- **Backend**: Express, TypeScript, JWT, bcrypt, Winston logger
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Router, Zustand, React Query
- **Common**: Shared TypeScript types

### Project Structure
```
web/
├── backend/
│   ├── src/
│   │   ├── config/       # Configuration
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── utils/        # Utilities
│   │   └── websocket/    # WebSocket server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── lib/         # API client
│   │   ├── pages/       # Route pages
│   │   ├── stores/      # Zustand stores
│   │   └── utils/       # Utilities
│   └── package.json
└── shared/
    └── types.ts         # Shared TypeScript types
```

## Next Steps

1. Set up PostgreSQL database with Prisma ORM
2. Implement connector management endpoints
3. Build automation builder UI
4. Add connector registry
5. Implement local device bridge
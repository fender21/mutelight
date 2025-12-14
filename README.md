# MuteLight Desktop App

Discord mute status LED controller for WLED devices.

## Features

- 🔑 **License Key Validation** - Secure authentication via Supabase
- 🎮 **Discord Integration** - Automatic mute detection via Discord RPC
- 💡 **WLED Control** - Real-time LED color changes based on mute status
- 🌈 **Zone Support** - Control individual LED segments
- ⚙️ **Settings** - Auto-start, minimize to tray, polling interval
- 🖥️ **Cross-Platform** - Windows, macOS, and Linux support

## Prerequisites

Before running the app, you need to create a Discord Application to get a Client ID:

1. Go to https://discord.com/developers/applications
2. Create a new application called "MuteLight"
3. Copy the Application ID (Client ID)
4. Update `DISCORD_CLIENT_ID` in `src/shared/constants.ts`

## Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

## Development

The project uses:

- **Electron** - Desktop app framework
- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (fast!)
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **@xhayper/discord-rpc** - Discord integration
- **@supabase/supabase-js** - Backend communication

### Project Structure

```
mutelight/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   ├── renderer/       # React UI (Browser)
│   └── shared/         # Shared types and constants
├── assets/             # App icons
└── scripts/            # Development scripts
```

### Development Commands

```bash
# Start development server
npm run dev

# Build main process
npm run build:main

# Build preload script
npm run build:preload

# Build renderer
npm run build:renderer

# Build all
npm run build

# Create distributable
npm run package

# Type check
npm run type-check
```

## Configuration

### Backend (Supabase)

The app connects to a Supabase backend with the following tables:

- `profiles` - User license keys
- `wled_devices` - WLED device configurations
- `light_zones` - LED zone definitions

Credentials are in `src/shared/constants.ts`.

### WLED Devices

Configure your WLED devices in the web dashboard, then sync them in the desktop app.

Each device needs:
- Name
- IP address (local network)
- Muted color (hex)
- Unmuted color (hex)

Optional zones allow controlling specific LED segments.

## Usage

1. **Launch the app** - Run `npm run dev` or the built executable
2. **Enter license key** - 32-character key from your account
3. **Sync settings** - Click "Sync Settings" to load your devices
4. **Join Discord voice** - The app will automatically detect mute changes
5. **Watch your LEDs** - They'll change color when you mute/unmute!

## Building for Distribution

### Windows

```bash
npm run package
# Output: release/MuteLight-1.0.0-x64-win.exe
```

Creates both NSIS installer and portable executable.

### macOS

```bash
npm run package
# Output: release/MuteLight-1.0.0.dmg
```

### Linux

```bash
npm run package
# Output: release/MuteLight-1.0.0.AppImage
```

## Troubleshooting

### Discord not connecting

- Make sure Discord is running
- Check that you've set the correct `DISCORD_CLIENT_ID`
- Discord RPC only works with the desktop Discord client (not browser)

### WLED devices offline

- Verify devices are on the same network
- Check IP addresses in your device configuration
- Test connectivity: Open `http://<device-ip>` in a browser

### License validation fails

- Check your internet connection
- Verify the license key is correct (32 characters)
- Ensure purchase is complete in web dashboard

## Security

The app follows Electron security best practices:

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Preload script with contextBridge
- ✅ External links open in browser
- ✅ Input validation on all IPC messages

## Logs

Application logs are stored in:

- **Windows**: `%APPDATA%\mutelight\logs\`
- **macOS**: `~/Library/Logs/mutelight/`
- **Linux**: `~/.config/mutelight/logs/`

## License

Copyright © 2025 MuteLight

## Support

For issues or questions:
- Web: https://mutelight.app
- Email: support@mutelight.app

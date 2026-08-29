# ZenV — Zero-Knowledge Identity Vault

> *"True security is not stored. It is generated."*

A stateless, zero-knowledge password manager and identity engine for Android. Built with React Native, TypeScript, and Expo.

## Overview

ZenV is not just a password manager — it is a **stateless identity engine** built for privacy purists who trust math over cloud servers. All data stays on your device, encrypted with AES-256, and the master key never leaves RAM.

## Features

- **Zero-Knowledge** — No data ever leaves your device
- **Stateless Generation** — Passwords derived from Master Key + Salt
- **Multi-Profile Partitioning** — Personal / Office / Burner profiles with isolated vaults
- **AES-256 Encrypted Storage** — Local vault secured with industry-standard encryption
- **Encrypted Backups** — Proprietary `.cvx` file format for portable exports
- **Ghost Mode (Offline First)** — Zero internet permissions; cannot "phone home"
- **Active Defense**
  - Screenshot blocking on sensitive screens
  - Clipboard auto-wipe to prevent memory leaks
  - Manual master key flushing from RAM
- **Cyberpunk UI** — Neon-glass aesthetic with dark mode default and smooth transitions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo |
| Language | TypeScript |
| Encryption | AES-256 (on-device) |
| Storage | Local encrypted vault |
| Platform | Android |

## Security Architecture

| Feature | Status | Protocol |
| :--- | :---: | :--- |
| **Zero-Knowledge** | ✅ | No data leaves your device. Ever. |
| **Stateless Gen** | ✅ | Passwords derived from Master Key + Salt. |
| **Multi-Profile** | ✅ | Windows-style user isolation (Personal/Office/Burner). |
| **Storage** | 🔒 | AES-256 Encrypted Local Vault. |
| **Backup** | 💾 | Proprietary `.cvx` encrypted file export. |
| **Internet** | ❌ | App has zero internet permissions. |

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Android SDK (for Android deployment)

### Installation

```bash
git clone https://github.com/ashroxy/zenv.git
cd zenv
npm install
```

### Run on Android

```bash
npx expo run:android
```

Or open the project in Expo Go for development.

### Build APK

```bash
eas build -p android
```

The APK is also available as a [Release download](https://github.com/ashroxy/zenv/releases/latest).

## License

MIT — fork it, build on it, make it yours.

---

[Report Bug](https://github.com/ashroxy/zenv/issues) · [Request Feature](https://github.com/ashroxy/zenv/issues) · [Releases](https://github.com/ashroxy/zenv/releases/latest)
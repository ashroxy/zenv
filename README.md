<div align="center">

# ZenV

**Stateless, zero-knowledge deterministic identity vault for Android and Web**

[![Build & Verification](https://img.shields.io/badge/verification-100%25%20passing-emerald?style=flat-square&logo=vitest)](https://github.com/ashroxy/zenv)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-blue?style=flat-square&logo=android)](https://github.com/ashroxy/zenv)
[![Security](https://img.shields.io/badge/network-airgapped%20by%20OS-blueviolet?style=flat-square&logo=shield)](https://github.com/ashroxy/zenv)
[![Crypto](https://img.shields.io/badge/crypto-PBKDF2%20%2B%20AES--256--GCM-orange?style=flat-square&logo=letsencrypt)](https://github.com/ashroxy/zenv)
[![License](https://img.shields.io/badge/license-AGPL--3.0-orange?style=flat-square)](LICENSE)

</div>

ZenV derives credentials mathematically from a master key instead of storing them. It uses PBKDF2‑HMAC‑SHA256 (100k iterations) and AES‑256‑GCM for encrypted storage, ensuring no plaintext passwords exist on disk.

**Key principles:**
- No server, no sync, no analytics
- Zero‑knowledge via deterministic derivation
- Hardware‑ and OS‑enforced airgap
- Memory‑hard cryptography

---

## Features

- **Stateless derivation** — Passwords = PBKDF2(masterKey, salt = `"zenv:v2:{profile}:{service}:{username}:{counter}"`).
- **Airgap enforced** — Release builds omit `android.permission.INTERNET`; web CSP uses `connect-src 'none'`.
- **AES‑256‑GCM at rest** — Account metadata encrypted under a session‑derived CryptoKey.
- **Multi‑profile isolation** — Each profile gets a unique cryptographic salt.
- **Ephemeral secrets** — Revealed passwords auto‑clear after 30 s; clipboard auto‑wipes.
- **Encrypted backups** — `.cvx` files are authenticated PBKDF2 + AES‑256‑GCM containers.
- **Self‑hosted UI** — Inter & JetBrains Mono fonts bundled; no external CDNs.

---

## Architecture

### 1. Deterministic Password Derivation

```
Master Key + Salt("zenv:v2:{profile}:{service}:{username}:{counter}")
    → PBKDF2-HMAC-SHA256 (100k iterations)
    → Uniform rejection sampling
    → Generated password
```

### 2. Vault Encryption at Rest

```
Master Secret + Salt("zenv:v2:storage:{profile}")
    → PBKDF2-HMAC-SHA256 (100k iterations) → AES-256-GCM key
    → IV (12 random bytes) + ciphertext + tag
```

---

## Repository Structure

```
zenv/
├── android/                   # Native Android Capacitor shell
│   ├── app/                   # Native app module & AndroidManifest.xml
│   │   └── src/
│   │       ├── main/          # Release configuration (INTERNET permission omitted)
│   │       └── debug/         # Debug configuration (INTERNET enabled for live-reload)
├── assets/                    # Self-hosted web assets
│   └── fonts/                 # Inter & JetBrains Mono WOFF2 binary fonts + licenses
├── components/                # React UI components
│   ├── EditAccountModal.tsx   # Account creation, edit, & password preview modal
│   ├── ErrorBoundary.tsx      # React error containment layer
│   ├── Generator.tsx          # Dynamic password generation workbench
│   ├── Icons.tsx              # Lucide icon set
│   ├── Intro.tsx              # Boot sequence animation (tap-to-skip)
│   ├── Manual.tsx             # Interactive offline user manual & security guide
│   ├── Settings.tsx           # Profile management, export/import, wipe, & lock
│   ├── UserSelect.tsx         # Multi-profile picker and registration
│   └── Vault.tsx              # Encrypted account listing with Quick Unlock
├── scripts/                   # Automated verification & build-gate checks
│   ├── assert-android-manifests.mjs   # Verifies release manifest lacks INTERNET
│   ├── assert-no-bundled-secrets.mjs  # Scans bundle for credentials & API tokens
│   └── assert-no-remote-assets.mjs    # Asserts zero remote dependencies or CDNs
├── services/                  # Business logic & Cryptography engines
│   ├── clipboard.ts           # Timed auto-clearing clipboard service
│   ├── cryptoUtils.ts         # PBKDF2, AES-GCM, & rejection sampling
│   ├── limits.ts              # Bounds and validation constants
│   ├── passwordGenerator.ts   # Derivation orchestration and legacy v1 compatibility
│   ├── schema.ts              # Runtime JSON validation schemas
│   └── storageService.ts      # Multi-profile AES-256-GCM storage service
├── types.ts                   # Core TypeScript interfaces & types
├── vite.config.ts             # Vite build pipeline with production CSP headers
└── vitest.config.ts           # Test runner configuration
```

---

## Offline & Airgap Guarantees

ZenV makes zero network calls at runtime. This is verified at four independent layers:

| Layer | Mechanism | Checked by |
| :--- | :--- | :--- |
| **Android OS** | `android.permission.INTERNET` is omitted from the release manifest. Sockets are denied by the kernel. | `npm run verify:android-manifests` |
| **Web CSP** | Production Content Security Policy enforces `connect-src 'none'` and forbids external scripts. | `vite.config.ts` |
| **Zero Remote Assets** | All fonts and icons are bundled locally in `assets/fonts/`. No external CDNs. | `npm run verify:no-remote-assets` |
| **Zero Cloud Dependencies** | Free of telemetry SDKs, analytics, cloud backends, or AI API dependencies. | `npm run verify:no-secrets` |

Debug builds retain `INTERNET` only for Capacitor live reload; release builds are offline-only.

---

## Getting Started

### Prerequisites

- **Node.js**: 18.0.0+
- **npm**: 9.0.0+
- **JDK**: OpenJDK 21 (for Android build)
- **Android SDK / Android Studio** (for Android build)

### Web Development

```bash
npm install
npm run dev
```

### Android Native Build

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug   # debug (with INTERNET for live-reload)
cd android && ./gradlew assembleRelease # release (INTERNET omitted)
```

---

## Verification Suite

```bash
npm run verify
```

The suite runs seven checks:

1. **TypeScript Typecheck** (`tsc --noEmit`)
2. **ESLint** static analysis
3. **Vitest Unit Tests** (69+ tests covering cryptographic determinism, entropy distribution, storage error handling, schema parsing, clipboard cleanup)
4. **Production Build** (tree-shaken asset packaging)
5. **No Secrets Scan** (regex scan of bundled output)
6. **No Remote Assets Check** (asserts zero CDN URLs in source or bundle)
7. **Android Manifest Verification** (validates `INTERNET` presence in debug and absence in release)

---

## Cryptographic Specifications

| Parameter | Specification | Purpose |
| :--- | :--- | :--- |
| **KDF Algorithm** | `PBKDF2-HMAC-SHA256` | Key stretching against brute-force attacks |
| **KDF Iterations** | `100,000` | Computational hardness factor |
| **Symmetric Cipher** | `AES-GCM` (256-bit key) | Authenticated encryption at rest |
| **IV Size** | `96-bit` (12 bytes) cryptographically random | Nonce uniqueness per storage write |
| **Character Sampling** | Uniform Rejection Sampling | Eliminates modulo bias across custom pools |
| **Legacy Compatibility**| `v1` derivation preserved | Guarantees existing passwords remain recoverable |

Source: `services/cryptoUtils.ts`, `services/passwordGenerator.ts`.

---

## License & Attribution

- **Source Code:** AGPL‑3.0‑or‑later (see `LICENSE`). Requires sharing source of any network-accessible derivative work.
- **Third-Party Notices:** See `NOTICE` for font licenses and dependency attributions.

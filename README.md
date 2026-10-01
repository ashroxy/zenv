<div align="center">

# ⚡ ZenV

### *Stateless, Zero-Knowledge Deterministic Identity Vault*

[![Build & Verification](https://img.shields.io/badge/verification-100%25%20passing-emerald?style=flat-square&logo=vitest)](https://github.com/ashroxy/zenv)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-blue?style=flat-square&logo=android)](https://github.com/ashroxy/zenv)
[![Security](https://img.shields.io/badge/network-airgapped%20by%20OS-blueviolet?style=flat-square&logo=shield)](https://github.com/ashroxy/zenv)
[![Crypto](https://img.shields.io/badge/crypto-PBKDF2%20%2B%20AES--256--GCM-orange?style=flat-square&logo=letsencrypt)](https://github.com/ashroxy/zenv)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

<p align="center">
  <strong>"True security is not stored. It is generated."</strong>
</p>

<p align="center">
  ZenV is a deterministic password generator and zero-knowledge vault for Android and Web. Instead of storing sensitive credentials in cloud databases or unencrypted keychains, ZenV computes cryptographic secrets on-the-fly using salted PBKDF2-HMAC-SHA256 and Web Crypto primitives.
</p>

</div>

---

## ⚡ Highlights & Key Features

* 🔒 **Stateless Deterministic Derivation:** Passwords are mathematically derived from `Master Key + Service + Username + Counter + Profile Salt`. They are never stored in plaintext on disk.
* 🌐 **Hardware & OS-Enforced Airgap:** 
  * `android.permission.INTERNET` is explicitly **omitted** from release builds. The OS blocks socket creation at the kernel level.
  * Production web CSP enforces `connect-src 'none'`.
  * Zero external telemetry, zero tracking, zero remote CDNs, and zero third-party cloud SDKs.
* 🛡️ **AES-256-GCM Encrypted Storage at Rest:** Account metadata and recipe parameters are encrypted under a non-extractable session `CryptoKey` with authenticated checksums.
* 👥 **Multi-Profile Architecture:** Completely segregated namespaces per user profile with unique cryptographic salts.
* ⏱️ **Memory Protection & Ephemeral Lifecycles:**
  * Auto-locking on background/app-switch drops all derived session keys.
  * Plaintext password reveal displays auto-expire after 30 seconds.
  * Timed auto-clearing clipboard wipes copied passwords from memory and clipboard history.
  * Android `FLAG_SECURE` blocks OS recents snapshots and prevents unauthorized screenshots.
* 📦 **Encrypted Backups (`.cvx`):** Authenticated JSON export/import containers encrypted with standalone PBKDF2 + AES-256-GCM.
* 🎨 **Cyberpunk Terminal Interface:** Dark-mode glassmorphic design system with 100% self-hosted **Inter** and **JetBrains Mono** font bundles.

---

## 📐 Architecture & Cryptographic Pipeline

### 1. Deterministic Password Derivation

```
┌──────────────┐   ┌─────────────────────────────────────────────────────────────┐
│  Master Key  │ + │ Salt: "zenv:v2:" + ProfileID + ":" + Service + ":" + ...    │
└──────┬───────┘   └──────────────────────────────┬──────────────────────────────┘
       │                                          │
       └──────────────────┬───────────────────────┘
                          │
                          ▼
            PBKDF2-HMAC-SHA256 (100,000 iters)
                          │
                          ▼
                  Raw Entropy Stream
                          │
                          ▼
           Uniform Rejection Sampling (Pool)
                          │
                          ▼
           Generated High-Entropy Password
```

### 2. Vault Encryption at Rest

```
┌─────────────────┐   ┌──────────────────────────────────────┐
│  Master Secret  │ + │ Salt: "zenv:v2:storage:" + ProfileID │
└────────┬────────┘   └──────────────────┬───────────────────┘
         │                               │
         └───────────────┬───────────────┘
                         │
                         ▼
        PBKDF2-HMAC-SHA256 (100,000 iters)
                         │
                         ▼
             AES-256-GCM (256-bit Key)
                         │
       ┌─────────────────┴─────────────────┐
       ▼                                   ▼
 [ 12-byte IV ]                  [ Encrypted Ciphertext + Tag ]
       │                                   │
       └─────────────────┬─────────────────┘
                         │
                         ▼
        Capacitor Filesystem / LocalStorage
```

---

## 📂 Repository Structure

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
│   ├── Icons.tsx              # Clean SVG icons (Lucide)
│   ├── Intro.tsx              # Cyberpunk boot sequence animation (tap-to-skip)
│   ├── Manual.tsx             # Interactive offline user manual & security guide
│   ├── Settings.tsx           # Profile management, export/import, wipe, & lock
│   ├── UserSelect.tsx         # Multi-profile picker and registration
│   └── Vault.tsx              # Encrypted account listing with Quick Unlock
├── scripts/                   # Automated verification & build-gate checks
│   ├── assert-android-manifests.mjs  # Verifies release manifest lacks INTERNET
│   ├── assert-no-bundled-secrets.mjs # Scans bundle for credentials & API tokens
│   └── assert-no-remote-assets.mjs   # Asserts zero remote dependencies or CDNs
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

## 🛡️ Offline & Airgap Guarantees

ZenV makes zero network calls. This is proven and checked at 4 independent layers:

| Layer | Mechanism | Checked by |
| :--- | :--- | :--- |
| **Android OS** | `android.permission.INTERNET` is omitted from the release manifest. Sockets are denied by the kernel. | `npm run verify:android-manifests` |
| **Web CSP** | Production Content Security Policy enforces `connect-src 'none'` and forbids external scripts. | `vite.config.ts` |
| **Zero Remote Assets** | All fonts and icons are bundled locally in `assets/fonts/`. No external CDNs. | `npm run verify:no-remote-assets` |
| **Zero Cloud Dependencies** | Free of telemetry SDKs, analytics, cloud backends, or AI API dependencies. | `npm run verify:no-secrets` |

---

## 🚀 Getting Started

### Prerequisites

* **Node.js**: 18.0.0+
* **npm**: 9.0.0+
* **JDK**: OpenJDK 21 (for Android build)
* **Android SDK / Android Studio** (for Android build)

### Web Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

### Android Native Build

```bash
# Build web bundle
npm run build

# Sync assets to Android project
npx cap sync android

# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK (Network permissions stripped)
cd android && ./gradlew assembleRelease
```

---

## 🧪 Comprehensive Verification Suite

Run the full end-to-end verification pipeline:

```bash
npm run verify
```

The verification suite runs:
1. **TypeScript Typecheck:** `tsc --noEmit`
2. **ESLint:** Code style and static analysis
3. **Vitest Unit Tests:** 69+ tests covering cryptographic determinism, entropy distribution, storage error handling, schema parsing, and clipboard memory cleanup
4. **Production Build:** Tree-shaken production asset packaging
5. **No Secrets Check:** RegEx scan of bundled distribution assets
6. **No Remote Assets Check:** Verification that zero CDN URLs exist in source or bundle
7. **Android Manifest Verification:** Validates `INTERNET` permission presence in debug and absence in release

---

## 🔐 Cryptographic Specifications

| Parameter | Specification | Purpose |
| :--- | :--- | :--- |
| **KDF Algorithm** | `PBKDF2-HMAC-SHA256` | Key stretching against brute-force attacks |
| **KDF Iterations** | `100,000` | Computational hardness factor |
| **Symmetric Cipher** | `AES-GCM` (256-bit key) | Authenticated encryption at rest |
| **IV Size** | `96-bit` (12 bytes) cryptographically random | Nonce uniqueness per storage write |
| **Character Sampling** | Uniform Rejection Sampling | Eliminates modulo bias across custom pools |
| **Legacy Compatibility**| `v1` derivation preserved | Guarantees existing passwords remain recoverable |

---

## 📄 License & Attribution

* **Source Code:** Released under the [MIT License](LICENSE).
* **Third-Party Notices:** See [NOTICE](NOTICE) for font licenses and dependency attributions.

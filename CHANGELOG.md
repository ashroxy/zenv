# Changelog

All notable changes to ZenV will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-15

### Fixed
- **Memory Leak in Vault:** Added `cancelAll()` to the `revealedPasswords` timer cleanup effect when switching profiles.
- **UI Overlay:** Increased Vault bottom padding to `pb-40` to resolve scroll-blocking issues caused by floating toast notifications.

### Changed
- Bumped Android `versionCode` to 2 and `versionName` to `1.0.1`.
- Sanitized release keystore configuration in `build.gradle` to load credentials via environment variables.

---

## [1.0.0] - 2026-10-01

### Added
- **Deterministic Password Generator:** Zero-storage credential derivation using PBKDF2-HMAC-SHA256 (100k iterations) and uniform rejection sampling.
- **Vault Storage at Rest:** AES-256-GCM encrypted local storage for account metadata (service, username, counter).
- **Airgap OS Enforcements:** Complete removal of `android.permission.INTERNET` from release Android manifests; strict `connect-src 'none'` Content Security Policy.
- **Offline Fonts & Assets:** Self-hosted Inter and JetBrains Mono fonts; zero external CDNs or analytics SDKs.
- **Verification Suite:** Automated gates checking TypeScript types, ESLint rules, Vitest suites (69 tests), bundle secret leakage, and Android manifest permissions.
- **Signed Android APK:** Release distribution build with native splash screens, launcher icons, and AGPL-3.0 licensing.

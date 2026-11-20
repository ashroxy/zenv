# ZenV Community Launch & Distribution Playbook

This document provides ready-to-use copy, submission details, and operational playbooks to launch ZenV across open-source and privacy communities.

---

## 1. Quick Launch Checklist

- [ ] **GitHub Topics:** Go to repo main page ➔ Click ⚙️ next to "About" ➔ Paste:
  `password-manager`, `privacy`, `security`, `airgap`, `cryptography`, `zero-knowledge`, `offline-first`, `android`, `capacitor`, `react`, `opensource`
- [ ] **GitHub Pages Active:** Go to repo Settings ➔ Pages ➔ Build and deployment: Source ➔ **GitHub Actions**.
- [ ] **Release APK Published:** Push a tag (e.g. `v1.0.1`) to trigger the release workflow or attach `zenv-v1.0.1.apk` under [GitHub Releases](https://github.com/ashroxy/zenv/releases).
- [ ] **Fastlane Metadata Verified:** Located in `fastlane/metadata/android/en-US/` for IzzyOnDroid & F-Droid crawling.

---

## 2. Reddit Launch Posts

### A. Subreddit: `r/privacy` and `r/opensource`

**Post Title:**
```text
I built ZenV: an airgapped, zero-storage password vault for Android and Web that calculates passwords mathematically
```

**Post Body:**
```markdown
Hey everyone,

Like many in the privacy community, I've always felt uneasy storing all my sensitive credentials in a database that syncs to the cloud. Even with zero-knowledge encryption, a compromised remote server, synchronization bug, or zero-day parser vulnerability puts the entire vault at risk.

To solve this, I built **ZenV**—a free, open-source, airgapped password and identity manager for Android and Web.

### How It Works (Deterministic Derivation)
Instead of storing passwords on disk, ZenV calculates credentials mathematically on the fly:
```
Master Key + Salt("zenv:v2:{profile}:{service}:{username}:{counter}")
  → PBKDF2-HMAC-SHA256 (100,000 iterations)
  → Uniform Rejection Sampling
  → Derived Password
```

### Key Guarantees
1. **OS-Level Airgap:** The release Android APK completely omits `android.permission.INTERNET`. Socket creation is denied directly by the Linux kernel. CI asserts this on every build.
2. **Zero Password Storage:** Passwords are never saved to disk in plaintext. Close the app or hit lock, and credentials vanish from memory.
3. **Password Rotations Handled Gracefully:** When a service requires rotating your password, increment the account's `:counter` to derive a fresh password without changing your master key.
4. **Encrypted Metadata at Rest:** Service names and counters are encrypted locally using `AES-256-GCM` with keys stretched from your session secret.
5. **Zero Remote Dependencies:** Bundled offline fonts (Inter & JetBrains Mono), zero external CDNs, no Firebase, and zero tracking code.
6. **Encrypted Offline Backups:** Export and import authenticated `.cvx` containers (PBKDF2 + AES-256-GCM).

### Links
- **Source Code (AGPL-3.0):** https://github.com/ashroxy/zenv
- **Live Web Demo:** https://ashroxy.github.io/zenv/
- **Android APK (Obtainium compatible):** https://github.com/ashroxy/zenv/releases/latest

I would love to get your thoughts on the derivation scheme, usability, and architecture!
```

---

### B. Subreddit: `r/fossdroid`

**Post Title:**
```text
ZenV – Airgapped Android password vault with zero network permissions (Obtainium ready)
```

**Post Body:**
```markdown
Hi r/fossdroid,

I built **ZenV**, a lightweight, fully open-source Android password manager that requires zero internet access:

- **True Airgap:** Compiled with zero network permissions (no `android.permission.INTERNET`). The Android OS prevents it from ever making a network request.
- **Stateless:** It derives passwords mathematically on the fly (PBKDF2-HMAC-SHA256 with 100k iterations and uniform rejection sampling) rather than storing passwords in a vault database.
- **Obtainium Ready:** You can add the GitHub repo URL directly into Obtainium to track and auto-update release APKs.
- **F-Droid / IzzyOnDroid:** Fastlane metadata and reproducible builds are ready in the repository.

**GitHub:** https://github.com/ashroxy/zenv
**Direct APK:** https://github.com/ashroxy/zenv/releases/latest
**License:** AGPL-3.0
```

---

## 3. Hacker News (Show HN)

Refer to [docs/SHOW_HN.md](SHOW_HN.md) for the exact submission copy.

**Timing:** Post on a Tuesday or Wednesday between 8:00 AM – 10:00 AM EST (12:00 PM – 2:00 PM UTC).

**Common Technical Discussion Points to Prepare For:**
- *Why PBKDF2 instead of Argon2id?*
  ZenV uses standard `SubtleCrypto` (WebCrypto API) available natively across all modern web browsers and Android WebView without requiring bulky WebAssembly binaries that violate strict Content Security Policies.
- *How does it avoid modulo bias?*
  Character mapping uses uniform rejection sampling over cryptographic random/hash bytes, guaranteeing uniform entropy across custom character sets.

---

## 4. Free App Directory Submissions

### A. AlternativeTo.net
1. Visit: **https://alternativeto.net/software/create/**
2. Fill in:
   - **Name:** ZenV
   - **Website / Repo:** `https://github.com/ashroxy/zenv`
   - **License:** Open Source (AGPL v3)
   - **Platforms:** Android, Web, Progressive Web App (PWA)
   - **Categories:** Password Managers, Security & Privacy Tools
   - **Alternatives to:** Bitwarden, 1Password, KeePassDX, Master Password
   - **Short Description:** Airgapped, zero-storage deterministic password manager for Android and Web that calculates credentials on demand.

### B. OpenAlternative.co
1. Visit: **https://openalternative.co/submit**
2. Submit repo link: `https://github.com/ashroxy/zenv`
3. Categorize as a self-hosted / local-first privacy alternative to proprietary cloud vaults.

### C. GitHub Awesome Lists Pull Requests
Submit a pull request to add ZenV under the Password Managers section of:
- `awesome-privacy` (https://github.com/pluja/awesome-privacy)
- `awesome-selfhosted` (https://github.com/awesome-selfhosted/awesome-selfhosted)

**Example Markdown Snippet for PR:**
```markdown
- [ZenV](https://github.com/ashroxy/zenv) - Airgapped, stateless deterministic password manager with zero network permissions. `AGPL-3.0` `Android/Web`
```

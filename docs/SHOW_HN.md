# Show HN Launch Draft

## Post Title
```text
Show HN: ZenV – An airgapped, zero-storage password generator for Android and Web
```

## URL
```text
https://github.com/ashroxy/zenv
```

## Post Body

```text
Hi HN,

Most password managers store an encrypted database of passwords and sync them across devices via cloud servers. If your storage is compromised, your sync provider suffers an outage, or a zero-day exploit strikes the vault format, all your credentials are at risk.

I built ZenV because I wanted a password manager that doesn't trust a cloud backend, doesn't sync across the internet, and doesn't store plaintext passwords anywhere on disk.

Instead of storing secrets, ZenV derives credentials mathematically on demand:
Master Key + Salt("zenv:v2:{profile}:{service}:{username}:{counter}") 
  -> PBKDF2-HMAC-SHA256 (100,000 iterations) 
  -> Uniform Rejection Sampling 
  -> Derived Password

Key guarantees:
1. True OS Airgap: In release Android builds, `android.permission.INTERNET` is completely omitted from the manifest. Socket creation is denied directly by the Linux kernel. CI asserts its absence on every build.
2. Web CSP: Production builds enforce `connect-src 'none'`. All fonts (Inter and JetBrains Mono) are bundled locally; zero external CDNs or analytics SDKs are used.
3. Encrypted Metadata at Rest: Service names and counter numbers are kept in local storage encrypted under AES-256-GCM using session-derived keys.
4. Ephemeral Secrets: Passwords revealed on screen auto-clear after 30 seconds, and the clipboard is automatically wiped.
5. Offline Backups: Export and import authenticated `.cvx` containers encrypted with PBKDF2 + AES-256-GCM.

The codebase is open-source under AGPL-3.0, verified with a local test suite (69 tests covering entropy distribution, rejection sampling, and cryptographic determinism), and includes pre-built signed Android APKs.

Code: https://github.com/ashroxy/zenv
Releases & APK: https://github.com/ashroxy/zenv/releases

I'd love feedback from the HN community on the cryptographic derivation scheme (services/cryptoUtils.ts) and the airgap verification gates.
```

## Launch Day Checklist
- [ ] Post on a weekday morning (between 8:00 AM – 10:00 AM EST / 12:00 PM – 2:00 PM UTC)
- [ ] Monitor the thread continuously for the first 3 hours to respond to technical questions
- [ ] Be prepared to discuss PBKDF2 vs Argon2id trade-offs (WebCrypto API browser support constraints)

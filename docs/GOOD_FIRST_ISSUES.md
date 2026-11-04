# Good First Issues

Copy and paste these directly into GitHub Issues, or run the provided `gh` CLI commands:

---

### Issue 1: Add keyboard shortcut (Ctrl/Cmd+K) to focus service search
**Labels:** `good first issue`, `enhancement`

**CLI Command:**
```bash
gh issue create --title "UI: Add keyboard shortcut (Ctrl/Cmd+K) to focus service search" --label "good first issue,enhancement" --body "### Goal
Allow desktop and web users to quickly search services by pressing \`Ctrl+K\` (or \`Cmd+K\` on macOS).

### Expected Behavior
- Pressing \`Ctrl+K\` or \`Cmd+K\` focuses the search input in Vault view.
- Pressing \`Escape\` clears the search input and unfocuses.

### Relevant Code
- \`components/Vault.tsx\`"
```

---

### Issue 2: Add QR code export for encrypted backups
**Labels:** `good first issue`, `enhancement`

**CLI Command:**
```bash
gh issue create --title "Feature: Add QR code display option for encrypted backup transfer" --label "good first issue,enhancement" --body "### Goal
Allow airgapped transfer of small encrypted backups between phones by rendering an animated or chunked QR code on screen.

### Proposed Solution
- Add an optional QR code view in \`components/Settings.tsx\` for exported \`.cvx\` payloads.
- Must operate 100% offline without remote QR API generators.

### Relevant Code
- \`components/Settings.tsx\`
- \`services/storageService.ts\`"
```

---

### Issue 3: Document steps for verifying release APK with apksigner offline
**Labels:** `good first issue`, `documentation`

**CLI Command:**
```bash
gh issue create --title "Docs: Document steps to verify release APK signatures using apksigner" --label "good first issue,documentation" --body "### Goal
Provide clear, copy-pasteable terminal instructions in \`docs/VERIFY_RELEASE.md\` showing users how to independently verify that pre-built release APKs match the open-source repository signatures using Android SDK's \`apksigner\`.

### Tasks
- Add guide for \`apksigner verify --verbose --print-certs zenv.apk\`
- Explain how to inspect SHA-256 fingerprint against published release notes."
```

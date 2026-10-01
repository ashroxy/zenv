# Security Policy

This document describes the security model, responsibilities, and procedures for handling security issues in the ZenV project.

## Threat Model

### Core Security Guarantees

1. **Zero‑Knowledge Architecture**
   - Passwords are never stored in plaintext or encrypted form on disk
   - All credentials are derived deterministically from the master key using PBKDF2‑HMAC‑SHA256
   - No secrets pass through the air unless the user enters them manually

2. **Offline Enforced by the OS**
   - Release builds omit `android.permission.INTERNET`
   - Web CSP production config enforces `connect-src 'none'`
   - All cryptographic operations happen locally on the device

3. **Memory Protection**
   - Auto‑locking on app background switches
   - Plaintext passwords auto‑clear after 30 seconds
   - Timed auto‑wiping of clipboard contents
   - Android `FLAG_SECURE` blocks OS snapshots and screenshots

4. **Secure Storage**
   - Account metadata encrypted with AES‑256‑GCM under a session‑derived CryptoKey
   - Non‑extractable key material for the master key
   - Authenticated encryption with integrity checks

## Vulnerability Handling

### Reporting Security Issues

If you discover a potential security vulnerability, please report it immediately to the project maintainers using the following methods:

**Primary Contact:**
- Email: mailme2ash008@gmail.com
- Please include as much information as possible:
  - Detailed description of the vulnerability
  - Steps to reproduce
  - Potential impact
  - Screenshots or logs if applicable

**Response Process:**

1. **Acknowledgment (1‑3 business days)**
   - Confirmation of receipt and initial assessment
   - Explanation of next steps

2. **Investigation (5‑10 business days)**
   - Reproduce the issue in a controlled environment
   - Assess the severity and potential impact
   - Identify affected versions

3. **Fix Development (10‑30 business days)**
   - Develop a patch or workaround
   - Ensure the fix doesn't introduce new vulnerabilities
   - Test thoroughly in multiple environments

4. **Disclosure (Public release)**
   - Publish a security advisory
   - Coordinate with affected users on patch deployment
   - Provide clear upgrade instructions

### Coordinated Disclosure

We follow coordinated disclosure practices:

- **No public disclosure** until a fix is available
- **Timeline coordination** with the reporter for patching
- **Clear communication** throughout the process
- **Responsible disclosure** to prevent malicious actors from exploiting the vulnerability

## Development Security Practices

### Code Security Requirements

1. **Cryptographic Implementation**
   - Use Web Crypto API (`crypto.subtle`) for all cryptographic operations
   - No third‑party crypto dependencies
   - Proper parameter validation before crypto operations
   - Resistance to timing attacks where possible

2. **Memory Management**
   - Clear sensitive data from memory when no longer needed
   - Use `TypedArray` with secure clearing where possible
   - Auto‑wiping of clipboard contents

3. **Input Validation**
   - Validate all user inputs against strict schemas
   - Sanitize all data before cryptographic operations
   - Reject malformed or suspicious inputs

### Build Security

1. **Dependency Management**
   - Regularly audit dependencies with `npm audit`
   - Pin dependency versions in `package-lock.json`
   - Avoid packages with known vulnerabilities

2. **Artifact Verification**
   - Run `npm run verify` before any release
   - Verify no bundled secrets in distribution artifacts
   - Check that network permissions are correctly stripped in release builds

### Runtime Security

1. **Permission Management**
   - Minimum principle: only request permissions that are absolutely necessary
   - Clearly document why each permission is needed
   - Provide user controls to revoke permissions when possible

2. **Backup Security**
   - Encrypted backups (`.cvx` format) are encrypted with PBKDF2 + AES‑256‑GCM
   - Backups are password‑protected and can only be restored with the correct master key
   - Backup files are validated for integrity before restoration

## Security Testing

### Automated Checks

The project includes comprehensive security verification through the `npm run verify` script, which runs:

1. **TypeScript Typecheck** (`tsc --noEmit`)
2. **ESLint** (code style and potential security issues)
3. **Vitest** (69+ security‑related unit tests)
4. **Production Build** (bundle analysis for secrets)
5. **No Secrets Scan** (regex scan of distribution artifacts)
6. **No Remote Assets Check** (verifies zero CDN URLs in source and bundle)
7. **Android Manifest Verification** (validates `INTERNET` permission presence in debug and absence in release)

### Security Test Coverage

| Area | Test Coverage |
|------|---------------|
| **Cryptographic Derivation** | Deterministic algorithm verification, cross‑implementation checks |
| **Entropy Generation** | Uniform rejection sampling, modulo bias prevention |
| **Storage Encryption** | Round‑trip verification, integrity checks, key rotation |
| **Memory Safety** | Auto‑wiping of clipboard and passwords, secure clearing |
| **Input Validation** | Schema validation, malformed input handling |
| **Error Handling** | Graceful failure without information leakage |
| **Legacy Compatibility** | v1 vault compatibility verification |

### Manual Security Testing

1. **Static Analysis**
   - Review code for potential security vulnerabilities
   - Check for hardcoded secrets, backdoors, or weak crypto

2. **Dynamic Testing**
   - Run the app in a controlled environment
   - Monitor for unexpected network connections
   - Verify auto‑locking behavior

3. **Fuzzing**
   - Test with malformed input files
   - Validate error handling and recovery

## Security Updates and Patch Management

### Severity Levels

- **Critical:** Remote code execution, authentication bypass, master key compromise
- **High:** Local privilege escalation, data exfiltration, cryptographic weakness
- **Medium:** Information disclosure, logic flaws, weak credentials
- **Low:** Cosmetic issues, usability problems

### Patch Process

1. **Issue Triaging**
   - Security issues receive priority handling
   - Severity assessment within 24 hours of report
   - Assign appropriate developer

2. **Fix Development**
   - Security fixes are developed and tested in isolation
   - Regression testing to ensure no functionality is broken
   - Security testing to verify the fix addresses the vulnerability

3. **Release Management**
   - Security patches are released on a rolling schedule
   - Coordinated communication with users about security updates
   - Clear upgrade instructions provided

## Security Hardening Checklist

- [ ] All secrets are removed from distribution artifacts (`verify:no-secrets`)
- [ ] No remote dependencies or CDNs (`verify:no-remote-assets`)
- [ ] Android release build omits `INTERNET` permission (`verify:android-manifests`)
- [ ] All user inputs validated against strict schemas
- [ ] Sensitive data auto‑wiped from memory and clipboard
- [ ] Encryption uses non‑extractable keys where possible
- [ ] Password derivation uses high iteration count (100k)
- [ ] Legacy vaults remain compatible but are deprecated
- [ ] All security findings are documented and tracked
- [ ] Security testing is integrated into the CI/CD pipeline

## Acknowledgments

We thank all researchers and security professionals who have contributed to improving ZenV's security:

- Vulnerability reporters who followed responsible disclosure
- Open source contributors who identified and fixed security issues
- Security researchers who reviewed the codebase and provided feedback

## Contact

For security issues, please contact the project maintainers directly at:

- **Email:** mailme2ash008@gmail.com

Please include "SECURITY ISSUE" in the subject line for priority handling.

---

*ZenV is committed to security by design and continuous improvement. We appreciate your help in making this project more secure.*

Built with security first principles in mind.
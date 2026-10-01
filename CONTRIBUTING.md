# Contributing Guide

Thank you for your interest in contributing to ZenV! This document outlines the process for submitting improvements, bug fixes, and new features.

## Prerequisites

Before contributing, please ensure:

- You have a clear understanding of the project's security and cryptographic guarantees
- You are familiar with the existing code patterns and TypeScript conventions
- You have Node.js 18+ and the Android SDK installed if you plan to build the Android app

## Getting Started

### 1. Fork and Clone

1. Fork the repository: `https://github.com/ashroxy/zenv`
2. Clone locally: `git clone https://github.com/your-username/zenv`
3. Navigate into the project: `cd zenv`

### 2. Environment Setup

```bash
# Install dependencies
npm install

# Run tests and verification
npm run verify
```

## Workflow

### Branch Naming Conventions

We use GitHub's default branch protection. Please follow these naming conventions:

- `bugfix/` for bug fixes
- `feature/` for new features
- `docs/` for documentation updates
- `refactor/` for code refactoring

### Commits

- Use conventional commit messages:
  ```
  <type>[scope]: <description>
  
  [optional body]
  [optional footer(s)]
  ```

- Example: `feat(components): add quick unlock button`

### Pull Requests (PRs)

1. Push your changes to a branch on your fork
2. Open a PR against the `main` branch of the original repository
3. Ensure your PR description includes:
   - Clear summary of the changes
   - Testing instructions
   - Impact on security or performance

### Code Review Process

- PRs require approval from the repository maintainer
- All checks must pass (typecheck, lint, tests, verification)
- Review comments must be addressed before merging

## Testing

### Running Tests

```bash
# Run unit tests
npm run test

# Run full verification suite
npm run verify
```

### Adding New Tests

- Write tests following the existing patterns in `services/*-test.ts` files
- Tests should cover both functionality and edge cases
- Include tests for security properties (either preservation of zero-knowledge guarantees or correct error handling)

## Development Environment

### Setting up Android Development

To work with the Android side of the project:

1. Ensure JDK 21 is installed
2. Install Android SDK and platform tools
3. Run `./gradlew` commands in the `android/` directory

### Building the App

#### Web Development

```bash
npm run dev
```

#### Android Build

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
cd android && ./gradlew assembleRelease
```

## Code Standards

### TypeScript

- Use strict TypeScript configuration (`tsconfig.json`)
- Follow ESLint rules (`npm run lint`)
- Avoid `any` type; use type assertions or proper interfaces when necessary

### Security

- Never commit secrets or private keys (verified by `verify:no-secrets`)
- Ensure cryptographic operations follow the existing patterns
- All passwords are derived deterministically; nothing is stored in plaintext

### React Components

- Use functional components with hooks
- Avoid side effects in render methods
- Include accessibility attributes where appropriate

## Documentation

### Updating README

- Keep the README accurate with the latest features and commands
- Document new scripts and tools added
- Update examples and instructions as needed

### Adding Component Documentation

- Include JSDoc comments for public APIs
- Document parameters, return types, and side effects
- Explain security considerations in comments

## Troubleshooting

### Common Issues

1. **Type errors in VS Code**
   - Run `npm run typecheck` to identify and fix issues

2. **Lint errors**
   - Run `npm run lint` to see detailed violations

3. **Test failures**
   - Check the test output for specific failures
   - Run individual test files to isolate issues

4. **Verification script failures**
   - Review the output of `npm run verify` for specific check failures

### Getting Help

- Check the existing issues on GitHub
- Open a new issue if you're facing a problem that's not documented
- Be prepared to provide:
  - Your operating system and version
  - Steps to reproduce the issue
  - Relevant error messages

## License

By contributing to ZenV, you agree that your contributions will be licensed under the AGPL‑3.0‑or‑later license.

## Code of Conduct

Please treat the project maintainers and other contributors with respect. Disrespectful or harassing behavior will not be tolerated.

---

### Thanks!

We appreciate your contributions and look forward to collaborating with you!

This CONTRIBUTING guide is based on community best practices and the project's security requirements.
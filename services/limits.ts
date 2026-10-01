/**
 * Single source of truth for numeric bounds and other limits.
 *
 * Kept separate from `cryptoUtils` so that validation modules can import the
 * limits without pulling in the crypto implementation (and without creating an
 * import cycle through `types.ts`).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_COUNTER = 9999;
export const MAX_PROFILE_NAME = 64;
export const MAX_SERVICE_NAME = 512;
export const MAX_USERNAME = 512;
export const MAX_NOTES_LENGTH = 10_000;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MIN_MASTER_KEY_BITS = 64;
export const CLIPBOARD_CLEAR_TIMEOUT_MS = 60_000;

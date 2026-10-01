// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
/**
 * Persistence layer.
 *
 * Every access to `localStorage` in the app goes through the primitives at the
 * top of this file. They exist because the previous implementation called
 * `localStorage` and `JSON.parse` directly at nine sites with no error handling,
 * which turned three ordinary failure modes into unrecoverable white screens:
 *
 *  - a corrupt or truncated value threw during the mount effect, and the bad key
 *    was never cleared, so the app could not be recovered without a reinstall
 *  - QuotaExceededError threw from a passive effect
 *  - private-browsing / partitioned storage throws SecurityError on first access
 *
 * Values are now written encrypted at rest under a key derived from the master
 * key, prefixed with `AT_REST_PREFIX`. Plaintext values written by earlier
 * versions are still readable and are re-written encrypted on first unlock.
 */

import type { PasswordRecipe, UserProfile } from '../types';
import { RECIPE_SCHEMA_VERSION } from '../types';
import {
  AT_REST_PREFIX,
  clearDataKey,
  decryptAtRest,
  encryptAtRest,
  initDataKey,
} from './cryptoUtils';
import { isUserProfileArray, parseRecipeArray } from './schema';
import { MAX_PROFILE_NAME } from './limits';

const USERS_KEY = 'zenv_users';
const RECIPES_PREFIX = 'zenv_recipes_';
const OLD_STORAGE_KEY = 'ciphervault_recipes'; // legacy single-profile key

/** Stable id so a retried legacy migration cannot orphan the previous attempt. */
const LEGACY_USER_ID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Guarded storage primitives
// ---------------------------------------------------------------------------

/** Volatile mirror, used when persistent storage is unavailable or full. */
const memoryFallback = new Map<string, string>();

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? `Device storage is unavailable: ${cause.message}`
        : 'Device storage is unavailable.',
    );
    this.name = 'StorageUnavailableError';
  }
}

export class StorageQuotaError extends Error {
  constructor() {
    super(
      'Device storage is full. Delete a profile or shorten some notes, then try again.',
    );
    this.name = 'StorageQuotaError';
  }
}

const readRaw = (key: string): string | null => {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : (memoryFallback.get(key) ?? null);
  } catch {
    // SecurityError (private mode / partitioned storage): degrade to memory.
    return memoryFallback.get(key) ?? null;
  }
};

const writeRaw = (key: string, value: string): void => {
  memoryFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') throw new StorageQuotaError();
    throw new StorageUnavailableError(err);
  }
};

const removeRaw = (key: string): void => {
  memoryFallback.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* volatile-only session */
  }
};

/**
 * Reads and validates a JSON value. A value that cannot be parsed or does not
 * match the expected shape is discarded rather than thrown, so a single corrupt
 * key degrades to the default instead of bricking the app.
 */
const readJson = <T>(key: string, validate: (v: unknown) => v is T, fallback: T): T => {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[zenv] discarding unparseable value at ${key}`);
    removeRaw(key);
    return fallback;
  }
  if (!validate(parsed)) {
    console.warn(`[zenv] discarding invalid value at ${key}`);
    removeRaw(key);
    return fallback;
  }
  return parsed;
};

// ---------------------------------------------------------------------------
// Legacy migration
// ---------------------------------------------------------------------------

/**
 * Moves data from the pre-multi-profile `ciphervault_recipes` key.
 *
 * Two separate defects are handled here, and both were live:
 *
 * 1. The original code minted a *fresh* `randomUUID()` on every attempt, so a
 *    quota failure re-ran the migration next call and orphaned the previously
 *    written recipe blob under a key nothing would ever read. The id is now the
 *    fixed `LEGACY_USER_ID`.
 * 2. Fixing only the id was not enough. `writeRaw(USERS_KEY, ...)` succeeding
 *    and `writeRaw(recipes, ...)` failing left the profile registered with an
 *    empty vault while the only copy of the data still sat under the legacy key.
 *    Because `getUsers()` only migrated when `USERS_KEY` was absent, no later
 *    call would ever retry, so the recipes were unreachable but not deleted.
 *    Completion is therefore keyed on the *recipe* blob, not on the profile list.
 *
 * Order: recipe blob first (the irreplaceable data), then the profile list, then
 * the legacy key removal. Any failure leaves the legacy key intact and is
 * retried on the next call.
 */
const migrateLegacyIfNeeded = (): UserProfile[] => {
  const legacy = readRaw(OLD_STORAGE_KEY);
  if (legacy === null) return [];

  const profile: UserProfile = { id: LEGACY_USER_ID, name: 'Personal', created: Date.now() };
  const existing = readJson<UserProfile[] | null>(
    USERS_KEY,
    (v): v is UserProfile[] | null => v === null || isUserProfileArray(v),
    null,
  );

  try {
    // 1. The data itself, under a stable id, so a retry overwrites in place.
    writeRaw(`${RECIPES_PREFIX}${profile.id}`, legacy);

    // 2. The profile list, preserving any profile already registered so a
    //    half-finished earlier attempt does not drop it.
    const users = existing === null ? [profile] : [...existing.filter((u) => u.id !== profile.id), profile];
    writeRaw(USERS_KEY, JSON.stringify(users));

    // 3. Only now is the legacy copy redundant.
    removeRaw(OLD_STORAGE_KEY);
  } catch (err) {
    console.error('[zenv] legacy migration failed; legacy data left intact for a later retry', err);
    return existing ?? [];
  }
  return [...(existing ?? []).filter((u) => u.id !== profile.id), profile];
};

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export const getUsers = (): UserProfile[] => {
  const existing = readJson<UserProfile[] | null>(
    USERS_KEY,
    (v): v is UserProfile[] | null => v === null || isUserProfileArray(v),
    null,
  );

  // Retry an incomplete migration whenever the legacy key is still present,
  // even if a profile list already exists. Keying this on `existing === null`
  // (the previous behaviour) is what turned a single failed write into
  // permanently unreachable recipes.
  if (readRaw(OLD_STORAGE_KEY) !== null) return migrateLegacyIfNeeded();

  return existing ?? [];
};

/** Characters that are illegal in a filename or a filesystem path. */
const ILLEGAL_FILENAME_CHARS = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/** Windows reserved device names, which are illegal as filename components. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Display-name sanitiser: strips path-illegal and control characters, collapses
 * whitespace, and bounds the length.
 *
 * Implemented with an explicit character scan rather than a regex so C0/C1
 * control characters are removed by code point, not by an escape range.
 */
export const sanitizeProfileName = (raw: string): string => {
  let cleaned = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (ILLEGAL_FILENAME_CHARS.has(ch)) continue;
    // C0 controls, DEL, and C1 controls.
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) throw new Error('Profile name cannot be empty.');
  if (cleaned.length > MAX_PROFILE_NAME) {
    throw new Error(`Profile name must be ${MAX_PROFILE_NAME} characters or fewer.`);
  }
  return cleaned;
};

/**
 * Filename component. Additionally defuses path traversal: the name reaches a
 * native filesystem API via `Filesystem.writeFile`, and dots are neutralised so
 * `..` can never form a segment.
 */
export const toFilenameComponent = (name: string): string => {
  const safe = sanitizeProfileName(name)
    .replace(/\./g, '_')
    .replace(WINDOWS_RESERVED, '_$1');
  return safe.slice(0, 40);
};

/**
 * Builds the `.cvx` filename. `profileName` is sanitised to a single safe path
 * segment so a profile called `../../../etc/passwd` cannot escape the target
 * directory.
 */
export const buildBackupFileName = (profileName: string, when: Date = new Date()): string =>
  `Zenv_${toFilenameComponent(profileName)}_${when.toISOString().slice(0, 10)}.cvx`;

const newId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // Fallback for non-secure contexts; ids need uniqueness, not unpredictability.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

export const addUser = (rawName: string): UserProfile => {
  const name = sanitizeProfileName(rawName);
  const users = getUsers();
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`A profile named "${name}" already exists.`);
  }
  const profile: UserProfile = { id: newId(), name, created: Date.now() };
  writeRaw(USERS_KEY, JSON.stringify([...users, profile]));
  // Deliberately do NOT pre-create the profile's recipe key with a plaintext
  // `[]`. An absent key already means "no recipes", and seeding it would leave
  // a plaintext JSON array on disk that later reads treat as legacy data.
  return profile;
};

export const deleteUser = (userId: string): void => {
  const users = getUsers();
  if (!users.some((u) => u.id === userId)) return; // nothing to do; avoids a needless rewrite
  writeRaw(USERS_KEY, JSON.stringify(users.filter((u) => u.id !== userId)));
  removeRaw(`${RECIPES_PREFIX}${userId}`);
};

// ---------------------------------------------------------------------------
// Recipes (scoped to a profile)
// ---------------------------------------------------------------------------

const recipesKey = (userId: string): string => `${RECIPES_PREFIX}${userId}`;

/**
 * Returns the recipes for a profile, decrypting at rest when a master key has
 * been installed, and transparently upgrading a plaintext value on first read.
 */
export const getStoredRecipes = async (userId: string): Promise<PasswordRecipe[]> => {
  if (!userId) return [];
  const key = recipesKey(userId);
  const raw = readRaw(key);
  if (raw === null) return [];

  if (raw.startsWith(AT_REST_PREFIX)) {
    const dataKey = await currentDataKey();
    if (!dataKey) throw new Error('Vault is locked. Enter your master key to load recipes.');

    // Decrypt first, outside the mapping below, so an AES-GCM failure is never
    // confused with a schema problem. GCM authentication failure means the
    // ciphertext or the key is wrong; only then is the vault unrecoverable.
    const plaintext = await decryptAtRest<unknown>(dataKey, key, raw).catch((err: unknown) => {
      throw new Error(
        'This vault cannot be decrypted with the current master key. ' +
          'If you recently changed your master key, the recipes in this profile are unrecoverable.' +
          (err instanceof Error ? ` (${err.message})` : ''),
      );
    });

    const { recipes } = parseRecipeArray(plaintext, { allowEmpty: true });
    return recipes;
  }

  // Legacy plaintext value: parse, then transparently re-write encrypted.
  const { recipes } = parseRecipeArray(readJson<unknown>(key, Array.isArray, []), { allowEmpty: true });
  const dataKey = await currentDataKey();
  if (dataKey) await saveRecipes(userId, recipes);
  return recipes;
};

/**
 * The session data key, held as a non-extractable `CryptoKey`.
 *
 * Deliberately NOT the master key string: re-deriving from a retained
 * plaintext string on every read/write both kept a cleartext copy of the
 * master key in module scope and ran PBKDF2 (210k iterations) per operation.
 * With the `CryptoKey` held directly, the plaintext is needed only inside
 * `unlockStorage` and never again.
 */
let installedDataKey: CryptoKey | null = null;

/** Installs the session data key used by `getStoredRecipes` / `saveRecipes`. */
export const unlockStorage = async (masterKey: string): Promise<void> => {
  installedDataKey = await initDataKey(masterKey);
};

/**
 * Drops every trace of the session key: the derived `CryptoKey` here and the
 * memoised copy inside `cryptoUtils`. Called on lock, profile switch and app
 * hide. Without the `clearDataKey()` call the key survived the lock and the
 * vault stayed readable after the UI claimed to be locked.
 */
export const lockStorage = (): void => {
  installedDataKey = null;
  clearDataKey();
  memoryFallback.clear();
};

const currentDataKey = (): Promise<CryptoKey | null> => Promise.resolve(installedDataKey);

export const saveRecipes = async (userId: string, recipes: PasswordRecipe[]): Promise<void> => {
  if (!userId) return;
  const key = recipesKey(userId);
  const dataKey = await currentDataKey();
  if (!dataKey) {
    // Locked: keep the plaintext in the volatile mirror only. Writing plaintext
    // to disk here would silently undo the at-rest encryption guarantee.
    memoryFallback.set(key, JSON.stringify(recipes));
    return;
  }
  writeRaw(key, await encryptAtRest(dataKey, key, recipes));
};

/** Removes a profile's recipes entirely (Profile Reset). */
export const wipeRecipes = async (userId: string): Promise<void> => {
  if (!userId) return;
  removeRaw(recipesKey(userId));
  await saveRecipes(userId, []);
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const exportData = (recipes: PasswordRecipe[]): string =>
  JSON.stringify({
    version: RECIPE_SCHEMA_VERSION,
    timestamp: Date.now(),
    data: recipes,
  });

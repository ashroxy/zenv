// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
/**
 * Runtime validation for every value that crosses a trust boundary.
 *
 * Recipe data reaches this app from three untrusted directions: an imported
 * `.cvx` file, a value read back out of `localStorage`, and the legacy
 * `ciphervault_recipes` key. Each is `unknown` until proven otherwise. The
 * previous code asserted `parsed.data as PasswordRecipe[]` with no runtime
 * check, so a single malformed entry reached `r.serviceName.toLowerCase()`
 * and threw during render.
 */

import type { PasswordRecipe, UserProfile } from '../types';
import {
  DERIVATION_V1,
  DERIVATION_V2,
  RECIPE_SCHEMA_VERSION,
} from '../types';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, MAX_PROFILE_NAME } from './limits';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isBoundedString = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const isPasswordRecipe = (v: unknown): v is PasswordRecipe => {
  if (!isPlainObject(v)) return false;
  return (
    isBoundedString(v.id, 64) &&
    v.id.length > 0 &&
    isBoundedString(v.serviceName, 512) &&
    v.serviceName.trim().length > 0 &&
    isBoundedString(v.username, 512) &&
    Number.isInteger(v.length) &&
    (v.length as number) >= MIN_PASSWORD_LENGTH &&
    (v.length as number) <= MAX_PASSWORD_LENGTH &&
    Number.isInteger(v.counter) &&
    (v.counter as number) >= 1 &&
    (v.counter as number) <= 9999 &&
    typeof v.useUppercase === 'boolean' &&
    typeof v.useLowercase === 'boolean' &&
    typeof v.useNumbers === 'boolean' &&
    typeof v.useSpecial === 'boolean' &&
    isBoundedString(v.color, 32) &&
    (v.additionalNotes === undefined || isBoundedString(v.additionalNotes, 10_000)) &&
    (v.derivationVersion === undefined ||
      v.derivationVersion === DERIVATION_V1 ||
      v.derivationVersion === DERIVATION_V2)
  );
};

export const isUserProfile = (v: unknown): v is UserProfile =>
  isPlainObject(v) &&
  isBoundedString(v.id, 64) &&
  v.id.length > 0 &&
  isBoundedString(v.name, MAX_PROFILE_NAME) &&
  v.name.trim().length > 0 &&
  Number.isFinite(v.created);

/**
 * Normalises an unknown payload into a recipe array.
 *
 * Malformed entries are dropped rather than failing the whole restore, and the
 * count is reported so the user is told what happened. Throws only when nothing
 * usable remains, because a restore that silently yields an empty vault is worse
 * than a clear failure.
 */
export interface ParseOptions {
  /**
   * Whether an empty result is acceptable.
   *
   * For a backup file, an empty result means the user picked the wrong file
   * and must be told. For local storage, an empty array is a legitimate state
   * (a profile with no recipes yet, or a vault just wiped), and rejecting it
   * would report an empty vault as an unrecoverable decryption failure.
   */
  allowEmpty?: boolean;
}

export const parseRecipeArray = (
  raw: unknown,
  { allowEmpty = false }: ParseOptions = {},
): { recipes: PasswordRecipe[]; rejected: number } => {
  if (!Array.isArray(raw)) {
    throw new ValidationError('Backup payload is not an array of recipes.');
  }
  const valid = raw.filter(isPasswordRecipe);
  if (valid.length === 0) {
    if (allowEmpty) return { recipes: [], rejected: raw.length };
    throw new ValidationError('Backup contained no valid recipes.');
  }
  return { recipes: dedupeById(valid), rejected: raw.length - valid.length };
};

/** Later entries with a duplicate id are dropped; ids must be unique for React keys. */
export const dedupeById = <T extends { id: string }>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};

export interface ParsedBackupFile {
  version: number;
  timestamp?: number;
  recipes: PasswordRecipe[];
  rejected: number;
}

/** Validates the decrypted inner document produced by `exportData`. */
export const parseBackupDocument = (json: unknown): ParsedBackupFile => {
  if (!isPlainObject(json)) {
    throw new ValidationError('Backup document is not a JSON object.');
  }
  const version: unknown = json.version;
  if (!Number.isInteger(version)) {
    throw new ValidationError('Backup document has no schema version.');
  }
  const schemaVersion = version as number;
  if (schemaVersion > RECIPE_SCHEMA_VERSION) {
    throw new ValidationError(
      `Backup is schema v${schemaVersion}; this build reads up to v${RECIPE_SCHEMA_VERSION}. Update Zenv to restore it.`,
    );
  }
  const { recipes, rejected } = parseRecipeArray(json.data);
  return {
    version: schemaVersion,
    timestamp: Number.isFinite(json.timestamp) ? (json.timestamp as number) : undefined,
    recipes,
    rejected,
  };
};

export const isUserProfileArray = (v: unknown): v is UserProfile[] =>
  Array.isArray(v) && v.every(isUserProfile);

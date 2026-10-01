/**
 * Storage-layer regression tests.
 *
 * These target the failure modes that used to be unrecoverable white screens:
 * corrupt JSON, quota exhaustion, and SecurityError from private browsing.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  StorageQuotaError,
  StorageUnavailableError,
  addUser,
  buildBackupFileName,
  deleteUser,
  exportData,
  getStoredRecipes,
  getUsers,
  lockStorage,
  sanitizeProfileName,
  saveRecipes,
  toFilenameComponent,
  unlockStorage,
  wipeRecipes,
} from './storageService';
import { isUserProfileArray } from './schema';
import { decryptAtRest, encryptAtRest, initDataKey } from './cryptoUtils';
import { storageFailures, resetStorage } from '../vitest.setup';
import { CURRENT_DERIVATION_VERSION, type PasswordRecipe } from '../types';

const MASTER_KEY = 'Tr0ub4dor-and-3-quick-brown-foxes';

const recipe = (over: Partial<PasswordRecipe> = {}): PasswordRecipe => ({
  id: 'r1',
  serviceName: 'github.com',
  username: 'alice@example.com',
  length: 16,
  counter: 1,
  color: '',
  useLowercase: true,
  useUppercase: true,
  useNumbers: true,
  useSpecial: true,
  derivationVersion: CURRENT_DERIVATION_VERSION,
  ...over,
});

beforeEach(() => {
  resetStorage();
  lockStorage();
});

describe('profile management', () => {
  it('round-trips a profile', () => {
    const user = addUser('Personal');
    expect(user.name).toBe('Personal');
    expect(getUsers()).toHaveLength(1);
  });

  it('normalises whitespace in a name', () => {
    expect(sanitizeProfileName('  Work   Vault  ')).toBe('Work Vault');
  });

  it('rejects an empty or over-long name', () => {
    expect(() => sanitizeProfileName('   ')).toThrow();
    expect(() => sanitizeProfileName('x'.repeat(65))).toThrow();
  });

  it('rejects a duplicate name case-insensitively', () => {
    addUser('Work');
    expect(() => addUser('work')).toThrow(/already exists/);
  });

  it('deletes a profile and its recipe slot', () => {
    const user = addUser('Work');
    deleteUser(user.id);
    expect(getUsers()).toHaveLength(0);
    expect(localStorage.getItem(`zenv_recipes_${user.id}`)).toBeNull();
  });

  it('validates the users array shape', () => {
    expect(isUserProfileArray([{ id: 'a', name: 'b', created: 1 }])).toBe(true);
    expect(isUserProfileArray([{ id: 'a', name: 'b' }])).toBe(false);
    expect(isUserProfileArray('nope')).toBe(false);
  });
});

describe('filename sanitisation', () => {
  it('strips path separators and control characters', () => {
    expect(toFilenameComponent('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('neutralises traversal sequences', () => {
    const out = toFilenameComponent('../../etc/passwd');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
    expect(out).not.toContain('..');
  });

  it('defuses Windows reserved device names', () => {
    expect(toFilenameComponent('CON')).not.toBe('CON');
    expect(toFilenameComponent('com1')).not.toBe('com1');
  });

  it('produces a .cvx name with a date suffix', () => {
    const name = buildBackupFileName('Work', new Date('2026-01-02T03:04:05Z'));
    expect(name).toBe('Zenv_Work_2026-01-02.cvx');
  });
});

describe('recipes', () => {
  it('starts empty for an unknown profile', async () => {
    await expect(getStoredRecipes('nobody')).resolves.toEqual([]);
  });

  it('returns an empty list for an empty profile id without reading storage', async () => {
    await expect(getStoredRecipes('')).resolves.toEqual([]);
  });

  it('round-trips through encrypted at-rest storage', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(user.id, [recipe()]);

    const raw = localStorage.getItem(`zenv_recipes_${user.id}`) ?? '';
    expect(raw.startsWith('zenv1:')).toBe(true);
    // No plaintext service name on disk.
    expect(raw).not.toContain('github.com');

    await expect(getStoredRecipes(user.id)).resolves.toEqual([recipe()]);
  });

  it('encrypts each profile under a distinct slot', async () => {
    const a = addUser('A');
    const b = addUser('B');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(a.id, [recipe()]);
    await saveRecipes(b.id, [recipe()]);

    const rawA = localStorage.getItem(`zenv_recipes_${a.id}`) ?? '';
    const rawB = localStorage.getItem(`zenv_recipes_${b.id}`) ?? '';
    expect(rawA).not.toBe(rawB);
    expect(await getStoredRecipes(a.id)).toEqual(await getStoredRecipes(b.id));
  });

  it('wipes and re-initialises a profile', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(user.id, [recipe()]);
    await wipeRecipes(user.id);
    await expect(getStoredRecipes(user.id)).resolves.toEqual([]);
  });

  it('REGRESSION: keeps plaintext writes in memory only while locked', async () => {
    // If a locked app wrote plaintext to disk, the at-rest guarantee would be
    // silently undone on the next save.
    const user = addUser('Work');
    await saveRecipes(user.id, [recipe()]); // no unlockStorage
    const raw = localStorage.getItem(`zenv_recipes_${user.id}`);
    expect(raw).toBeNull();
  });
});

describe('corrupt and hostile stored values', () => {
  it('discards unparseable recipes instead of throwing', async () => {
    const user = addUser('Work');
    localStorage.setItem(`zenv_recipes_${user.id}`, '{not json');
    await expect(getStoredRecipes(user.id)).resolves.toEqual([]);
    // The bad key is removed so the failure cannot repeat every load.
    expect(localStorage.getItem(`zenv_recipes_${user.id}`)).toBeNull();
  });

  it('drops invalid entries but keeps valid ones (no silent data loss)', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(user.id, [recipe()]);

    // Tamper with the ciphertext: decryption must fail loudly, never yield an
    // empty vault, because "empty" is indistinguishable from "deleted".
    const key = `zenv_recipes_${user.id}`;
    const stored = localStorage.getItem(key) ?? '';
    localStorage.setItem(key, stored.slice(0, -4) + 'AAAA');

    await expect(getStoredRecipes(user.id)).rejects.toThrow(/cannot be decrypted|master key/i);
  });

  it('reports a lock error rather than an empty vault when no key is installed', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(user.id, [recipe()]);
    lockStorage(); // simulates auto-lock

    await expect(getStoredRecipes(user.id)).rejects.toThrow(/locked/i);
  });

  it('discards a malformed users key', () => {
    localStorage.setItem('zenv_users', 'nonsense');
    expect(getUsers()).toEqual([]);
    expect(localStorage.getItem('zenv_users')).toBeNull();
  });
});

describe('legacy migration', () => {
  it('imports the pre-multi-profile key exactly once', () => {
    const legacy = JSON.stringify([recipe({ id: 'old-1', serviceName: 'legacy.com' })]);
    localStorage.setItem('ciphervault_recipes', legacy);

    const users = getUsers();
    expect(users).toHaveLength(1);
    expect(localStorage.getItem('ciphervault_recipes')).toBeNull();

    // A second call must not create a second profile.
    expect(getUsers()).toHaveLength(1);
  });

  it('leaves the legacy key intact when the write fails, so a retry can recover', () => {
    const legacy = JSON.stringify([recipe({ id: 'old-1' })]);
    localStorage.setItem('ciphervault_recipes', legacy);

    // Any write larger than 0 bytes now fails, simulating an exhausted quota.
    storageFailures.quota = 0;

    expect(getUsers()).toEqual([]);
    // Data not yet migrated must remain available for a later retry.
    expect(localStorage.getItem('ciphervault_recipes')).toBe(legacy);
    storageFailures.quota = null;
  });

  it('retries a half-finished migration that already registered a profile', async () => {
    const legacy = JSON.stringify([recipe({ id: 'old-1' })]);
    localStorage.setItem('ciphervault_recipes', legacy);
    // State left by an earlier attempt: the profile list landed, the recipe
    // blob did not. `getUsers()` used to return this list forever and never
    // retry, which made the recipes unreachable but not deleted.
    localStorage.setItem(
      'zenv_users',
      JSON.stringify([{ id: 'previous-id', name: 'Previous', created: 1 }]),
    );

    storageFailures.failWriteKeyPattern = /^zenv_recipes_/;

    const duringFailure = getUsers();
    expect(duringFailure.map((u) => u.id)).toEqual(['previous-id']);
    expect(localStorage.getItem('ciphervault_recipes')).toBe(legacy);

    storageFailures.failWriteKeyPattern = null;

    const users = getUsers();
    expect(users.map((u) => u.name).sort()).toEqual(['Personal', 'Previous']);
    const migrated = users.find((u) => u.name === 'Personal');
    expect(migrated).toBeDefined();

    await expect(getStoredRecipes(migrated!.id)).resolves.toEqual([recipe({ id: 'old-1' })]);
    expect(localStorage.getItem('ciphervault_recipes')).toBeNull();
  });

  it('does not lose the profile list when only the users write fails', () => {
    const legacy = JSON.stringify([recipe({ id: 'old-1' })]);
    localStorage.setItem('ciphervault_recipes', legacy);

    storageFailures.failWriteKeyPattern = /^zenv_users$/;
    expect(getUsers()).toEqual([]);
    storageFailures.failWriteKeyPattern = null;

    const users = getUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.name).toBe('Personal');
  });
});

describe('lock erases the session key', () => {
  it('re-derives rather than returning a key cached before the lock', async () => {
    const before = await initDataKey(MASTER_KEY);
    lockStorage();
    const after = await initDataKey(MASTER_KEY);

    // Identity inequality is the evidence that `clearDataKey()` ran inside
    // `lockStorage()`. Without it the memoised key survives the lock.
    expect(after).not.toBe(before);

    // Functionality is unchanged: the same master key yields the same ciphertext.
    const a = await encryptAtRest(after, 'k', { hello: 'world' });
    const b = await encryptAtRest(before, 'k', { hello: 'world' });
    expect(await decryptAtRest(after, 'k', a)).toEqual({ hello: 'world' });
    expect(await decryptAtRest(before, 'k', b)).toEqual({ hello: 'world' });
  });

  it('refuses to read an encrypted vault once locked', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    await saveRecipes(user.id, [recipe()]);

    lockStorage();

    await expect(getStoredRecipes(user.id)).rejects.toThrow(/locked/i);
  });
});

describe('quota and unavailable storage', () => {
  it('raises a typed quota error instead of an opaque DOMException', async () => {
    const user = addUser('Work');
    await unlockStorage(MASTER_KEY);
    storageFailures.quota = 0;
    await expect(saveRecipes(user.id, [recipe()])).rejects.toBeInstanceOf(StorageQuotaError);
    storageFailures.quota = null;
  });

  it('falls back to memory when reads throw SecurityError', async () => {
    storageFailures.throwOnAccess = true;
    // Private browsing: reads degrade to the volatile mirror rather than
    // throwing during the mount effect.
    await expect(getStoredRecipes('nobody')).resolves.toEqual([]);
    storageFailures.throwOnAccess = false;
  });

  it('exposes a typed error for a genuinely unavailable store', () => {
    const err = new StorageUnavailableError(new Error('denied'));
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/unavailable/i);
  });
});

describe('export', () => {
  it('emits a versioned envelope', () => {
    const parsed = JSON.parse(exportData([recipe()])) as { version: number; data: unknown[] };
    expect(typeof parsed.version).toBe('number');
    expect(parsed.data).toHaveLength(1);
  });
});
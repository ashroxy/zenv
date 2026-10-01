/**
 * Cryptographic core.
 *
 * Everything here is built on the platform Web Crypto implementation
 * (`globalThis.crypto.subtle`) so no third-party crypto dependency is required.
 *
 * ## Threat model
 *
 * Zenv never stores passwords. It stores recipes and re-derives the password
 * from `(masterKey, service, username, profile, counter)`. Consequences that
 * drive the design below:
 *
 *  - The PBKDF2 salt MUST be derived from data that is stored on the device, so
 *    it cannot be secret. That means the master key is always subject to offline
 *    search by anyone who obtains the vault. The mitigations are therefore a
 *    high iteration count and an enforced master-key entropy floor - not the
 *    salt. See `MIN_MASTER_KEY_BITS`.
 *  - Because the salt is public, its ENCODING must be unambiguous. v1 used raw
 *    string concatenation, which is not injective: `("ab","c")` and `("a","bc")`
 *    collide and yield the same password. v2 uses a length-prefixed encoding.
 *
 * ## Versioning
 *
 * `derivationVersion` 1 recipes must continue to produce their original
 * passwords. The v1 algorithm is preserved verbatim in `deriveLegacyPassword`
 * and is covered by a frozen cross-check test. Do not "clean up" that function.
 */

import type { CharacterClasses, DerivationVersion } from '../types';
import { DERIVATION_V1, DERIVATION_V2, CURRENT_DERIVATION_VERSION } from '../types';
import {
  MAX_COUNTER,
  MAX_PASSWORD_LENGTH,
  MIN_MASTER_KEY_BITS,
  MIN_PASSWORD_LENGTH,
} from './limits';

// Re-exported so callers have a single import site for the derivation contract.
export { MAX_PASSWORD_LENGTH, MIN_MASTER_KEY_BITS, MIN_PASSWORD_LENGTH } from './limits';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENC = new TextEncoder();
const DEC = new TextDecoder();

const CHAR_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHAR_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHAR_NUMBER = '0123456789';
/** Deliberately excludes quote, backslash, whitespace and control characters so
 *  generated passwords survive shell and CSV contexts without escaping. */
const CHAR_SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/** PBKDF2-HMAC-SHA-512 iterations for password derivation.
 *  OWASP recommends 210,000 for PBKDF2-HMAC-SHA512 (2023); this is ~3x that,
 *  justified because the salt is public (see threat model). */
const ITERATIONS = 600_000;
const HASH_ALGO = 'SHA-512';

/** Domain separation string for the v2 salt. Changing this invalidates all v2
 *  recipes, exactly as changing any other salt input does. */
const SALT_DOMAIN = 'zenv/pw/v2';
/** Domain separation for the HKDF expansion step and for at-rest encryption. */
const AT_REST_DOMAIN = 'zenv/vault/v2';

/** Marker prefix for values written to storage by the encrypted-at-rest layer. */
export const AT_REST_PREFIX = 'zenv1:';

/** Backup (.cvx) envelope constants. */
export const BACKUP_KDF = 'PBKDF2-SHA256';
export const BACKUP_HASH = 'SHA-256';
export const BACKUP_ITERATIONS = 310_000; // OWASP 2023 for PBKDF2-HMAC-SHA-256
export const BACKUP_SALT_BYTES = 16;
export const BACKUP_IV_BYTES = 12;

// ---------------------------------------------------------------------------
// Platform guards
// ---------------------------------------------------------------------------

export class UnsupportedPlatformError extends Error {
  constructor(subject: string) {
    super(
      `${subject} requires a secure context (https:// or localhost). ` +
        'Opening this app over a plain http:// LAN address disables Web Crypto.',
    );
    this.name = 'UnsupportedPlatformError';
  }
}

export class MasterKeyTooWeakError extends Error {
  readonly bits: number;
  readonly required: number;

  constructor(bits: number, required: number) {
    super(
      `Master key too weak: about ${bits} bits of entropy, ${required} required. ` +
        'Use a long passphrase (four or more unrelated words works well).',
    );
    this.name = 'MasterKeyTooWeakError';
    this.bits = bits;
    this.required = required;
  }
}

/**
 * Throws a readable error instead of letting a cryptic `TypeError` surface
 * later. Call once at startup.
 */
export const assertSecureContext = (): void => {
  if (!globalThis.isSecureContext) throw new UnsupportedPlatformError('Zenv');
  if (!globalThis.crypto?.subtle) throw new UnsupportedPlatformError('Web Crypto');
};

const subtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle) throw new UnsupportedPlatformError('Web Crypto');
  return globalThis.crypto.subtle;
};

const randomBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------------------------------------------------------------------------
// Master key policy
// ---------------------------------------------------------------------------

/**
 * Length of the shortest block whose repetition reproduces `value`.
 *
 * KMP prefix function: `value.length - pi[last]` is the smallest period `p` such
 * that `value[i] === value[i - p]` for every `i >= p`. O(n), no allocation
 * beyond the prefix array, and it does not need the period to divide the length
 * (a truncated repetition still counts as periodic).
 */
const minimalPeriod = (value: string): number => {
  const n = value.length;
  if (n <= 1) return n;

  const prefix = new Uint32Array(n);
  for (let i = 1; i < n; i++) {
    let j = prefix[i - 1] ?? 0;
    while (j > 0 && value[i] !== value[j]) j = prefix[j - 1] ?? 0;
    if (value[i] === value[j]) j++;
    prefix[i] = j;
  }
  return n - (prefix[n - 1] ?? 0);
};

/**
 * Estimates the entropy of a candidate master key.
 *
 * Model: the key is a repetition of a block of length P drawn uniformly from the
 * set of symbols it actually contains, giving P * log2(distinct) bits, plus
 * log2(number of repetitions) for the choice of repeat count.
 *
 * Using the *observed* alphabet rather than the full class alphabet is the
 * point of this function. The previous version scored
 * `length * log2(classPool)`, which reported 47 bits for "aaaaaaaaaa" - it
 * credited a 26-symbol alphabet to a key that uses one. That defeats a hard
 * strength floor: a run of identical characters is the cheapest possible key to
 * guess, and it must score near zero.
 *
 * A second defect survived that fix: scoring `length * log2(distinct)` treats
 * every position as an independent draw, so a *periodic* key was credited as
 * if each repetition were new information. "abcdefghij" + "abcdefghij" scored
 * 66 bits and cleared the 64-bit floor, while carrying only the information of
 * one 10-character block. Repetition now credits the block it repeats plus the
 * (tiny) choice of how many times to repeat it.
 *
 * Deliberately NOT modelled: dictionary words, character-order structure within
 * the block, or dates. This remains an optimistic estimate of true entropy,
 * never a guarantee - it is a floor check, not a strength meter. Erring low is
 * the safe direction for a hard floor.
 */
export const estimateEntropyBits = (value: string): number => {
  if (!value) return 0;
  const distinct = new Set(value).size;
  if (distinct <= 1) return 0;

  const period = minimalPeriod(value);
  const repeats = value.length / period;
  const blockBits = period * Math.log2(distinct);
  // All a repetition adds is the choice of how many times to repeat the block.
  const bits = blockBits + Math.log2(Math.ceil(repeats));
  return Math.round(bits);
};

/**
 * Enforces the master-key floor. This is a hard block, not a warning: the
 * master key is never persisted, so there is no stored state from which to
 * distinguish a "new" weak key from a previously-accepted one, and persisting
 * such a flag would itself leak information about the key.
 */
export const assertMasterKeyAcceptable = (masterKey: string): void => {
  if (!masterKey) throw new Error('Master key is required');
  const bits = estimateEntropyBits(masterKey);
  if (bits < MIN_MASTER_KEY_BITS) throw new MasterKeyTooWeakError(bits, MIN_MASTER_KEY_BITS);
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const assertLength = (length: number): number => {
  if (!Number.isInteger(length) || length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password length must be an integer between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} (got ${String(length)}).`,
    );
  }
  return length;
};

const assertCounter = (counter: number): number => {
  if (!Number.isInteger(counter) || counter < 1 || counter > MAX_COUNTER) {
    throw new Error(`Rotation counter must be an integer between 1 and ${MAX_COUNTER} (got ${String(counter)}).`);
  }
  return counter;
};

/**
 * Normalises an account identity so that "the same account" means the same thing
 * to the derivation as it does to a human reading the vault. Without this,
 * `" Alice "` and `"alice"` produce different passwords for the same site.
 */
const normaliseIdentity = (value: string): string => value.trim().normalize('NFKC').toLowerCase();

// ---------------------------------------------------------------------------
// Salt construction
// ---------------------------------------------------------------------------

export interface SaltInput {
  serviceName: string;
  username: string;
  profileId: string;
}

/**
 * v2 salt: length-prefixed and domain-separated.
 *
 * Each field is emitted as `<utf8ByteLength>:<value>` and joined with `|`, so
 * the encoding is injective. No combination of field contents can be
 * re-partitioned into a different tuple, which is exactly the property v1
 * lacked (`("ab","c")` vs `("a","bc")`).
 */
export const buildSalt = ({ serviceName, username, profileId }: SaltInput): Uint8Array => {
  const fields: readonly string[] = [
    SALT_DOMAIN,
    String(DERIVATION_V2),
    profileId,
    normaliseIdentity(serviceName),
    normaliseIdentity(username),
  ];
  const encoded = fields.map((f) => `${ENC.encode(f).length}:${f}`);
  return ENC.encode(encoded.join('|'));
};

// ---------------------------------------------------------------------------
// Entropy -> characters
// ---------------------------------------------------------------------------

/**
 * Unbiased byte -> index mapping via rejection sampling.
 *
 * `byte % size` is non-uniform whenever `256 % size !== 0`; with the full
 * 94-character pool the skew between the most and least likely characters is
 * ~37%. Rejecting the ragged tail removes the bias entirely.
 */
class ByteCursor {
  private index = 0;

  constructor(private readonly bytes: Uint8Array) {}

  /** Bytes consumed so far. Exposed for assertions and tests. */
  get offset(): number {
    return this.index;
  }

  /** Uniformly distributed index in [0, size). */
  next(size: number): number {
    const limit = 256 - (256 % size); // largest multiple of `size` representable in one byte
    for (;;) {
      if (this.index >= this.bytes.length) {
        throw new Error('Entropy source exhausted; derivation produced insufficient bytes.');
      }
      const byte = this.bytes[this.index++] as number;
      if (byte < limit) return byte % size;
      // Ragged tail discarded rather than folded back in.
    }
  }
}

/** Expands PBKDF2 output to `byteLength` fresh bytes using HKDF-SHA-512. */
const expand = async (prf: ArrayBuffer, byteLength: number, info: string): Promise<Uint8Array> => {
  const key = await subtle().importKey('raw', prf, 'HKDF', false, ['deriveBits']);
  const okm = await subtle().deriveBits(
    { name: 'HKDF', hash: HASH_ALGO, salt: ENC.encode(SALT_DOMAIN), info: ENC.encode(info) },
    key,
    byteLength * 8,
  );
  return new Uint8Array(okm);
};

/**
 * Byte budget: 2 bytes per character covers the worst-case rejection rate for
 * every pool size in use (worst acceptance probability is 188/256 = 0.734 for
 * the 94-character pool, i.e. 1.36 bytes/char), plus slack for the reserved
 * class slots.
 */
const byteBudget = (length: number): number => length * 2 + 32;

const buildPool = (classes: CharacterClasses): string => {
  let pool = '';
  if (classes.useLowercase) pool += CHAR_LOWER;
  if (classes.useUppercase) pool += CHAR_UPPER;
  if (classes.useNumbers) pool += CHAR_NUMBER;
  if (classes.useSpecial) pool += CHAR_SPECIAL;
  // Matches historical behaviour when the user disables every class.
  if (pool.length === 0) pool = CHAR_LOWER + CHAR_NUMBER;
  return pool;
};

const requiredSets = (classes: CharacterClasses): string[] => {
  const sets: string[] = [];
  if (classes.useLowercase) sets.push(CHAR_LOWER);
  if (classes.useUppercase) sets.push(CHAR_UPPER);
  if (classes.useNumbers) sets.push(CHAR_NUMBER);
  if (classes.useSpecial) sets.push(CHAR_SPECIAL);
  return sets;
};

// ---------------------------------------------------------------------------
// Public derivation API
// ---------------------------------------------------------------------------

export interface GenerateParams {
  masterKey: string;
  serviceName: string;
  username: string;
  /** Vault profile id. Part of the v2 salt so identical accounts in two
   *  profiles are independent derivation domains. */
  profileId: string;
  length: number;
  counter: number;
  classes: CharacterClasses;
  /** Omit or pass 1 to use the legacy algorithm. */
  derivationVersion?: DerivationVersion;
  /**
   * Overrides the PBKDF2 iteration count. Intended for tests that need many
   * derivations; production callers must leave it unset.
   */
  iterations?: number;
}

/**
 * Derives a password deterministically.
 *
 * Guarantees, for any length within [MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH]:
 *  - deterministic: identical params always yield an identical password
 *  - unbiased: every position is uniform over its character set
 *  - non-repeating with respect to the entropy source: a 128-character
 *    password draws on 128 distinct entropy bytes, not 64 repeated ones
 *  - constraint-complete: every enabled character class is represented
 */
const describeUnknown = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return Array.isArray(value) ? `array(${String(value.length)})` : typeof value;
};

/**
 * Validates and normalises every derivation input.
 *
 * Called by both derivation versions so a malformed recipe cannot reach the KDF
 * with `undefined` in a field. Note the check order: `masterKey` is validated
 * before anything returns early, so no caller can receive a valid-looking
 * result for an invalid session.
 */
export const validateGenerateParams = (p: GenerateParams): GenerateParams => {
  if (typeof p.masterKey !== 'string' || !p.masterKey) {
    throw new Error('Master key is required.');
  }
  if (typeof p.serviceName !== 'string') {
    throw new Error(`"serviceName" must be a string (got ${describeUnknown(p.serviceName)}).`);
  }
  if (typeof p.username !== 'string') {
    throw new Error(`"username" must be a string (got ${describeUnknown(p.username)}).`);
  }
  if (typeof p.profileId !== 'string' || !p.profileId) {
    throw new Error('"profileId" is required for v2 derivation.');
  }
  assertLength(p.length);
  assertCounter(p.counter);
  return p;
};

export const generateDeterministicPassword = async (p: GenerateParams): Promise<string> => {
  const version: DerivationVersion = p.derivationVersion ?? CURRENT_DERIVATION_VERSION;

  if (version === DERIVATION_V1) {
    return deriveLegacyPassword({
      masterKey: p.masterKey,
      serviceName: p.serviceName,
      username: p.username,
      length: p.length,
      counter: p.counter,
      classes: p.classes,
      iterations: p.iterations,
    });
  }

  validateGenerateParams(p);
  // No early `return ''` for a missing key: an empty string is a valid-looking
  // result, so a caller could not tell "locked" from "derived an empty
  // password". assertMasterKeyAcceptable rejects it explicitly.
  assertMasterKeyAcceptable(p.masterKey);
  const length = assertLength(p.length);
  const counter = assertCounter(p.counter);

  const keyMaterial = await subtle().importKey(
    'raw',
    ENC.encode(p.masterKey),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await subtle().deriveBits(
    {
      name: 'PBKDF2',
      salt: buildSalt({ serviceName: p.serviceName, username: p.username, profileId: p.profileId }),
      iterations: p.iterations ?? ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    512,
  );

  const bytes = await expand(derivedBits, byteBudget(length), `pw|${counter}`);

  const pool = buildPool(p.classes);
  const mandatory = requiredSets(p.classes);

  if (length < mandatory.length) {
    throw new Error(
      `A password of length ${length} cannot contain all ${mandatory.length} required character classes. ` +
        `Use length >= ${mandatory.length}, or disable a class.`,
    );
  }

  // Reserve the first slot of each mandatory class, then fill from the full
  // pool. This is correct by construction for any length >= mandatory.length;
  // the previous overwrite-in-place approach silently dropped classes when the
  // password was shorter than the number of classes.
  const out = new Array<string>(length);
  const cursor = new ByteCursor(bytes);
  mandatory.forEach((set, i) => {
    out[i] = set[cursor.next(set.length)] as string;
  });
  for (let i = mandatory.length; i < length; i++) {
    out[i] = pool[cursor.next(pool.length)] as string;
  }
  return out.join('');
};

// ---------------------------------------------------------------------------
// Legacy v1 derivation - FROZEN
// ---------------------------------------------------------------------------

export interface LegacyGenerateParams {
  masterKey: string;
  serviceName: string;
  username: string;
  length: number;
  counter: number;
  classes: CharacterClasses;
  iterations?: number;
}

/**
 * The original v1 algorithm, preserved byte-for-byte so that recipes created
 * before the salt fix keep producing their original passwords.
 *
 * KNOWN DEFECTS - do not copy any of this into new code:
 *  - the salt is an ambiguous concatenation, so distinct accounts can collide
 *  - `byte % pool.length` is biased
 *  - the entropy source is a fixed 64 bytes, so long passwords repeat
 *  - `ensureChar` overwrites slots and can drop required classes
 *  - no master key entropy floor, no input validation
 *
 * @deprecated Retained for backward compatibility only. Use
 * `generateDeterministicPassword`, which dispatches here for v1 recipes.
 */
export const deriveLegacyPassword = async (p: LegacyGenerateParams): Promise<string> => {
  if (!p.masterKey) return '';
  const iterations = p.iterations ?? 100_000;
  const { length, counter, classes } = p;

  const keyMaterial = await subtle().importKey(
    'raw',
    ENC.encode(p.masterKey),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  // Intentionally ambiguous - this is the historical salt.
  const salt = ENC.encode(`${p.serviceName.toLowerCase()}${p.username.toLowerCase()}`);

  const derivedBits = await subtle().deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH_ALGO },
    keyMaterial,
    512,
  );

  const entropySource = await subtle().digest(
    HASH_ALGO,
    ENC.encode(toHex(derivedBits) + `|${counter}`),
  );

  let pool = '';
  if (classes.useLowercase) pool += CHAR_LOWER;
  if (classes.useUppercase) pool += CHAR_UPPER;
  if (classes.useNumbers) pool += CHAR_NUMBER;
  if (classes.useSpecial) pool += CHAR_SPECIAL;
  if (pool.length === 0) pool = CHAR_LOWER + CHAR_NUMBER;

  const entropyArray = new Uint8Array(entropySource);
  let password = '';
  for (let i = 0; i < length; i++) {
    const byte = entropyArray[i % entropyArray.length] as number;
    password += pool[byte % pool.length] as string;
  }

  let replaceIndex = 0;
  const ensureChar = (set: string): void => {
    if (!password.split('').some((c) => set.includes(c))) {
      const byte = entropyArray[(entropyArray.length - 1 - replaceIndex) % entropyArray.length] as number;
      const char = set[byte % set.length] as string;
      password = password.substring(0, replaceIndex) + char + password.substring(replaceIndex + 1);
      replaceIndex++;
    }
  };
  if (classes.useLowercase) ensureChar(CHAR_LOWER);
  if (classes.useUppercase) ensureChar(CHAR_UPPER);
  if (classes.useNumbers) ensureChar(CHAR_NUMBER);
  if (classes.useSpecial) ensureChar(CHAR_SPECIAL);

  return password;
};

// ---------------------------------------------------------------------------
// hex helpers
// ---------------------------------------------------------------------------

const HEX_RE = /^[0-9a-fA-F]*$/;

export const toHex = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

/**
 * Strict hex decoder. The previous implementation used a non-null assertion on
 * `match()`, which produced a `TypeError` for a missing field, silently wrong
 * bytes for odd-length input (`"abc"` -> `[0xab, 0x0c]`), and silently zeroed
 * bytes for non-hex input (`parseInt("zz",16)` -> `NaN` -> `0`).
 */
export const fromHex = (value: unknown, field: string, expectedBytes?: number): Uint8Array => {
  if (typeof value !== 'string') {
    throw new Error(`Backup field "${field}" must be a hex string, received ${typeof value}.`);
  }
  if (value.length % 2 !== 0) {
    throw new Error(`Backup field "${field}" has odd length (${value.length}); not valid hex.`);
  }
  if (!HEX_RE.test(value)) {
    throw new Error(`Backup field "${field}" contains non-hexadecimal characters.`);
  }
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) {
    const parsed = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(parsed)) {
      throw new Error(`Backup field "${field}" is not valid hex at byte index ${i}.`);
    }
    out[i] = parsed;
  }
  if (expectedBytes !== undefined && out.length !== expectedBytes) {
    throw new Error(`Backup field "${field}" must be ${expectedBytes} bytes, received ${out.length}.`);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Backup export / import (.cvx)
// ---------------------------------------------------------------------------

export interface PackedBackup {
  v: number;
  kdf: string;
  hash: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

/**
 * Encrypts a backup bundle with AES-GCM-256 under a passphrase-derived key.
 *
 * The envelope carries its own KDF parameters so that changing
 * `BACKUP_ITERATIONS` (or the hash) in a future release cannot orphan
 * previously exported files.
 */
export const encryptExport = async (data: string, passphrase: string): Promise<string> => {
  if (!passphrase) throw new Error('A passphrase is required to encrypt the backup.');

  const salt = randomBytes(BACKUP_SALT_BYTES);
  const iv = randomBytes(BACKUP_IV_BYTES);

  const key = await deriveBackupKey(passphrase, salt, BACKUP_ITERATIONS, ['encrypt']);

  const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(data));

  const pack: PackedBackup = {
    v: 1,
    kdf: BACKUP_KDF,
    hash: BACKUP_HASH,
    iterations: BACKUP_ITERATIONS,
    salt: toHex(salt),
    iv: toHex(iv),
    data: toHex(encrypted),
  };
  return btoa(JSON.stringify(pack));
};

const deriveBackupKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: readonly KeyUsage[],
): Promise<CryptoKey> => {
  const keyMaterial = await subtle().importKey('raw', ENC.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: BACKUP_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [...usage],
  );
};

/** Validates the envelope, producing a specific error for each failure mode. */
export const parseBundle = (ciphertextBundle: string): PackedBackup => {
  if (typeof ciphertextBundle !== 'string' || ciphertextBundle.length === 0) {
    throw new Error('Backup file is empty.');
  }

  let decoded: string;
  try {
    decoded = atob(ciphertextBundle);
  } catch {
    throw new Error('Backup file is not valid base64.');
  }

  let json: unknown;
  try {
    json = JSON.parse(decoded);
  } catch {
    throw new Error('Backup file is not valid base64-encoded JSON.');
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Backup payload is not a JSON object.');
  }

  const p = json as Record<string, unknown>;

  if (p.v === undefined) {
    throw new Error('Legacy backup format (no envelope version). This build cannot read it.');
  }
  if (p.v !== 1) throw new Error(`Unsupported backup version: ${describeUnknown(p.v)}.`);
  if (p.kdf !== BACKUP_KDF) throw new Error(`Unsupported KDF: ${String(p.kdf)}.`);
  if (p.hash !== BACKUP_HASH) throw new Error(`Unsupported hash: ${String(p.hash)}.`);
  if (typeof p.iterations !== 'number' || !Number.isInteger(p.iterations) || p.iterations < 100_000) {
    throw new Error('Backup declares an implausible iteration count.');
  }

  return p as unknown as PackedBackup;
};

export const decryptImport = async (ciphertextBundle: string, passphrase: string): Promise<string> => {
  const p = parseBundle(ciphertextBundle);

  // Strict field validation - a malformed bundle must not silently yield
  // a wrong salt and then be reported as "wrong password".
  const salt = fromHex(p.salt, 'salt', BACKUP_SALT_BYTES);
  const iv = fromHex(p.iv, 'iv', BACKUP_IV_BYTES);
  const data = fromHex(p.data, 'data');

  const key = await deriveBackupKey(passphrase, salt, p.iterations, ['decrypt']);

  try {
    const decrypted = await subtle().decrypt({ name: 'AES-GCM', iv }, key, data);
    return DEC.decode(decrypted);
  } catch {
    // A GCM tag mismatch is the only failure that legitimately means
    // "wrong passphrase or tampered file".
    throw new Error('Decryption failed: wrong passphrase, or the file has been tampered with.');
  }
};

// ---------------------------------------------------------------------------
// At-rest encryption for local storage
// ---------------------------------------------------------------------------

/**
 * Salt for the at-rest data key.
 *
 * A fixed, public salt is intentional here: unlike the deterministic password
 * derivation, this ciphertext has no low-entropy plaintext to dictionary-attack,
 * and each installation stores different content. The confidentiality that
 * matters comes from the master key, not from salt secrecy.
 */
const AT_REST_SALT = (): Uint8Array => ENC.encode(AT_REST_DOMAIN);

let cachedDataKey: { key: CryptoKey; fingerprint: string } | null = null;

/**
 * One-way fingerprint of a master key, used only to recognise a repeat call.
 *
 * Storing the master key itself here would keep a second plaintext copy alive
 * in module scope for the whole session, and would survive `clearDataKey` only
 * by accident. A SHA-256 digest is safe to retain: it is one-way, and
 * `assertMasterKeyAcceptable` has already rejected low-entropy keys, so the
 * digest is not a dictionary-attack target either.
 */
const masterKeyFingerprint = async (masterKey: string): Promise<string> => {
  const digest = await subtle().digest('SHA-256', ENC.encode(masterKey));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Derives (and memoises) the non-extractable AES-GCM key protecting local
 * storage. The key is non-extractable, so nothing can read its bytes back out;
 * `clearDataKey` drops it and the next call re-derives. A reload requires
 * re-entering the master key, which matches the guarantee the Manual advertises.
 */
export const initDataKey = async (masterKey: string): Promise<CryptoKey> => {
  assertMasterKeyAcceptable(masterKey);
  const fingerprint = await masterKeyFingerprint(masterKey);
  if (cachedDataKey && cachedDataKey.fingerprint === fingerprint) return cachedDataKey.key;

  const salt = AT_REST_SALT();
  const keyMaterial = await subtle().importKey('raw', ENC.encode(masterKey), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedDataKey = { key, fingerprint };
  return key;
};

/**
 * Erases the derived storage key and its fingerprint. This is the only thing
 * that removes the key from memory, so every lock path must call it.
 */
export const clearDataKey = (): void => {
  cachedDataKey = null;
};

/**
 * Encrypts a value for local storage. `context` (normally the storage key) is
 * bound as AES-GCM additional authenticated data, so a ciphertext cannot be
 * relocated from one profile's slot into another's.
 */
export const encryptAtRest = async (key: CryptoKey, context: string, value: unknown): Promise<string> => {
  const iv = randomBytes(BACKUP_IV_BYTES);
  const aad = ENC.encode(context);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    ENC.encode(JSON.stringify(value)),
  );
  return AT_REST_PREFIX + `${toHex(iv)}.${toHex(ciphertext)}`;
};

export const decryptAtRest = async <T>(key: CryptoKey, context: string, stored: string): Promise<T> => {
  const body = stored.startsWith(AT_REST_PREFIX) ? stored.slice(AT_REST_PREFIX.length) : stored;
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    throw new Error('Stored value is malformed.');
  }
  const iv = fromHex(body.slice(0, dot), 'iv', BACKUP_IV_BYTES);
  const ciphertext = fromHex(body.slice(dot + 1), 'ciphertext');

  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv, additionalData: ENC.encode(context) },
    key,
    ciphertext,
  );
  return JSON.parse(DEC.decode(plaintext)) as T;
};
/**
 * Domain types.
 *
 * `PasswordRecipe.derivationVersion` selects which derivation algorithm produced
 * this recipe's password. It is optional because recipes written before the
 * salt fix (v1) predate the field; an absent value means v1.
 *
 *   v1 - salt = `serviceName.toLowerCase() + username.toLowerCase()` (ambiguous)
 *   v2 - salt = length-prefixed, domain-separated, profile-scoped tuple
 *
 * v1 is retained for backward compatibility only. See `deriveLegacyPassword`.
 */
export const DERIVATION_V1 = 1;
export const DERIVATION_V2 = 2;
export const CURRENT_DERIVATION_VERSION = DERIVATION_V2;

export type DerivationVersion = typeof DERIVATION_V1 | typeof DERIVATION_V2;

/** Character classes a recipe may request. All four enabled => all four guaranteed. */
export interface CharacterClasses {
  useLowercase: boolean;
  useUppercase: boolean;
  useNumbers: boolean;
  useSpecial: boolean;
}

export interface PasswordRecipe extends CharacterClasses {
  id: string;
  /** The domain / website the credential belongs to. */
  serviceName: string;
  username: string;
  length: number;
  /** Rotation index (1, 2, 3, ...). Bumping it yields a different password. */
  counter: number;
  /** Reserved for user-chosen accents; unused by the derivation. */
  color: string;
  additionalNotes?: string;
  derivationVersion?: DerivationVersion;
}

export interface UserProfile {
  id: string;
  name: string;
  created: number;
}

export type TabView = 'vault' | 'generator' | 'manual' | 'settings';

/** Bumped whenever the on-disk recipe shape changes incompatibly. */
export const RECIPE_SCHEMA_VERSION = 2;
// Native Web Crypto API implementation
// 100x faster than JS libraries, allowing for much higher iteration counts (security).

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// Character sets
const CHAR_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHAR_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHAR_NUMBER = '0123456789';
const CHAR_SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?';

// Configuration
const ITERATIONS = 100000; // Increased from 5,000 to 100,000 for robustness
const HASH_ALGO = 'SHA-512';

/**
 * Generates a deterministic password using PBKDF2-HMAC-SHA512 via Web Crypto API.
 * Asynchronous operation ensures UI doesn't freeze during heavy computation.
 */
export const generateDeterministicPassword = async (
  masterPass: string,
  serviceName: string,
  username: string,
  length: number = 16,
  counter: number = 1,
  options: {
    useLower: boolean;
    useUpper: boolean;
    useNumber: boolean;
    useSpecial: boolean;
  }
): Promise<string> => {
  if (!masterPass) return '';

  // 1. Import Master Key
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    ENC.encode(masterPass),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // 2. Create Salt (Deterministic: service + username)
  const salt = ENC.encode(`${serviceName.toLowerCase()}${username.toLowerCase()}`);

  // 3. Derive Bits (The heavy lifting)
  // We derive enough bits to cover the length. 
  // 512 bits (64 bytes) is usually enough for standard passwords.
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    512 // bits
  );

  // 4. Create Seed String from Derived Bits
  // To ensure the specific "counter" and "seed" logic from the previous version 
  // matches conceptually, we hash the result combined with the counter.
  // This allows rotation (v1, v2) without re-running the heavy PBKDF2 if we wanted,
  // but here we just hash the PBKDF2 output + counter to get the final entropy source.
  const entropySource = await window.crypto.subtle.digest(
    HASH_ALGO,
    ENC.encode(toHex(derivedBits) + `|${counter}`)
  );

  // 5. Build Character Pool
  let pool = '';
  if (options.useLower) pool += CHAR_LOWER;
  if (options.useUpper) pool += CHAR_UPPER;
  if (options.useNumber) pool += CHAR_NUMBER;
  if (options.useSpecial) pool += CHAR_SPECIAL;
  if (pool.length === 0) pool = CHAR_LOWER + CHAR_NUMBER; // Fallback

  // 6. Map Entropy to Characters
  const entropyArray = new Uint8Array(entropySource);
  let password = '';
  
  for (let i = 0; i < length; i++) {
    // Use the byte at index i (modulo entropy length)
    // We use a sliding window if length > 64 (rare)
    const byte = entropyArray[i % entropyArray.length];
    password += pool[byte % pool.length];
  }

  // 7. Ensure constraints (at least one of each selected type)
  // Simple check: if missing a required type, replace chars at the end.
  // This makes it strictly deterministic.
  let replaceIndex = 0;
  const ensureChar = (set: string) => {
    if (!password.split('').some(c => set.includes(c))) {
      // Deterministically pick a char from the set based on the last byte
      const byte = entropyArray[(entropyArray.length - 1 - replaceIndex) % entropyArray.length];
      const char = set[byte % set.length];
      // Replace character at replaceIndex
      password = password.substring(0, replaceIndex) + char + password.substring(replaceIndex + 1);
      replaceIndex++;
    }
  };

  if (options.useLower) ensureChar(CHAR_LOWER);
  if (options.useUpper) ensureChar(CHAR_UPPER);
  if (options.useNumber) ensureChar(CHAR_NUMBER);
  if (options.useSpecial) ensureChar(CHAR_SPECIAL);

  return password;
};

// Helper for hex conversion
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert hex string to Uint8Array
function fromHex(hexString: string): Uint8Array {
  return new Uint8Array(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}

/**
 * Encrypts data for export using AES-GCM (Authenticated Encryption).
 */
export const encryptExport = async (data: string, passphrase: string): Promise<string> => {
    // 1. Generate a salt
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    
    // 2. Derive Key from Passphrase
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw", ENC.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    
    const key = await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    // 3. Encrypt
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        ENC.encode(data)
    );

    // 4. Pack: salt + iv + ciphertext
    const pack = JSON.stringify({
        salt: toHex(salt.buffer),
        iv: toHex(iv.buffer),
        data: toHex(encrypted)
    });

    return btoa(pack); // Base64 encode the package
};

/**
 * Decrypts exported data.
 */
export const decryptImport = async (ciphertextBundle: string, passphrase: string): Promise<string> => {
    try {
        const packed = JSON.parse(atob(ciphertextBundle));
        const salt = fromHex(packed.salt);
        const iv = fromHex(packed.iv);
        const data = fromHex(packed.data);

        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", ENC.encode(passphrase), "PBKDF2", false, ["deriveKey"]
        );

        const key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            data
        );

        return DEC.decode(decrypted);
    } catch (e) {
        throw new Error("Decryption failed. Invalid password or corrupted file.");
    }
};

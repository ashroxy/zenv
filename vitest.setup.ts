/**
 * Vitest setup: install a controllable in-memory `localStorage`.
 *
 * The production code targets the browser WebView, but the storage layer only
 * touches the Storage interface, so a faithful stub exercises the real code
 * paths (including the self-healing parse and quota fallback) without jsdom.
 *
 * `__failQuota` / `__throwOnAccess` let tests simulate the two failure modes
 * that actually matter: QuotaExceededError and SecurityError (private mode).
 */

interface StorageStub {
  get length(): number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

class MemoryStorage implements StorageStub {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    const bytes = new TextEncoder().encode(String(value)).length;
    if (storageFailures.quota !== null && bytes > storageFailures.quota) {
      throw quotaExceeded();
    }
    if (storageFailures.failWriteKeyPattern?.test(key)) {
      throw quotaExceeded();
    }
    this.map.set(key, String(value));
  }
}

/**
 * Injectable failure modes.
 *
 * `failWriteKeyPattern` exists for partial-failure tests: a real quota
 * exhaustion does not fail every write, it fails the write that crosses the
 * limit. Simulating "writes under this key pattern throw" reproduces the
 * half-completed migrations that a blanket quota=0 test cannot reach.
 */
export const storageFailures: {
  quota: number | null;
  throwOnAccess: boolean;
  failWriteKeyPattern: RegExp | null;
} = {
  quota: null,
  throwOnAccess: false,
  failWriteKeyPattern: null,
};

const quotaExceeded = (): DOMException =>
  new DOMException(`Failed to execute 'setItem' on 'Storage': Quota exceeded.`, 'QuotaExceededError');

const backing = new MemoryStorage();

const guarded: StorageStub = {
  get length() {
    if (storageFailures.throwOnAccess) {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
    return backing.length;
  },
  clear: () => backing.clear(),
  getItem: (k) => {
    if (storageFailures.throwOnAccess) {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
    return backing.getItem(k);
  },
  key: (i) => backing.key(i),
  removeItem: (k) => {
    if (storageFailures.throwOnAccess) {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
    backing.removeItem(k);
  },
  setItem: (k, v) => {
    if (storageFailures.throwOnAccess) {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
    backing.setItem(k, v);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: guarded,
  configurable: true,
  writable: true,
});

/** Reset between tests: empty storage and no injected failures. */
export const resetStorage = (): void => {
  storageFailures.quota = null;
  storageFailures.throwOnAccess = false;
  storageFailures.failWriteKeyPattern = null;
  backing.clear();
};
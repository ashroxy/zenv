// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import { CLIPBOARD_CLEAR_TIMEOUT_MS } from './limits';

let activeClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopiedSecret: string | null = null;

/**
 * Copies a sensitive string (such as a derived password) to the system clipboard
 * and schedules an automatic wipe after a timeout window.
 *
 * Leaving plaintext secrets in the OS clipboard indefinitely exposes them to
 * other apps and clipboard listeners. The auto-wipe is best-effort: modern
 * browsers require user gesture or document focus to write to the clipboard.
 */
export const copySecret = async (
  secret: string,
  timeoutMs: number = CLIPBOARD_CLEAR_TIMEOUT_MS,
): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is not available.');
  }

  await navigator.clipboard.writeText(secret);
  lastCopiedSecret = secret;

  if (activeClearTimer !== null) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }

  activeClearTimer = setTimeout(() => {
    activeClearTimer = null;
    void wipeClipboardIfMatching(secret);
  }, timeoutMs);
};

/**
 * Immediately clears the clipboard if it was populated by Zenv.
 */
export const clearClipboard = async (): Promise<void> => {
  if (activeClearTimer !== null) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
  const secret = lastCopiedSecret;
  lastCopiedSecret = null;
  if (secret) {
    await wipeClipboardIfMatching(secret);
  }
};

/** Cancels any scheduled clipboard auto-wipe timer. */
export const cancelClipboardClear = (): void => {
  if (activeClearTimer !== null) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
};

const wipeClipboardIfMatching = async (expectedSecret: string): Promise<void> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;

    // If readText is available and permitted, verify before wiping so we don't
    // overwrite user clipboard data if they copied something else in the meantime.
    if (navigator.clipboard.readText) {
      try {
        const current = await navigator.clipboard.readText();
        if (current !== expectedSecret) {
          return; // User already copied something else
        }
      } catch {
        // readText might require explicit permission prompt; fall back to overwriting
      }
    }

    await navigator.clipboard.writeText('');
    if (lastCopiedSecret === expectedSecret) {
      lastCopiedSecret = null;
    }
  } catch {
    // Clipboard write may fail if document is unfocused; best-effort
  }
};


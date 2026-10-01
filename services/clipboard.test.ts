// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copySecret, clearClipboard, cancelClipboardClear } from './clipboard';

describe('clipboard auto-wipe service', () => {
  let clipboardContent = '';
  let writeTextMock: ReturnType<typeof vi.fn>;
  let readTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardContent = '';
    writeTextMock = vi.fn((text: string) => {
      clipboardContent = text;
      return Promise.resolve();
    });
    readTextMock = vi.fn(() => Promise.resolve(clipboardContent));

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
        readText: readTextMock,
      },
      configurable: true,
    });
  });

  afterEach(() => {
    cancelClipboardClear();
    vi.useRealTimers();
  });

  it('copies secret and auto-wipes after timeout', async () => {
    await copySecret('my-secret-pw', 1000);
    expect(clipboardContent).toBe('my-secret-pw');
    expect(writeTextMock).toHaveBeenCalledWith('my-secret-pw');

    // Advance time by 999ms - should still be there
    vi.advanceTimersByTime(999);
    expect(clipboardContent).toBe('my-secret-pw');

    // Advance to 1000ms - auto-wipe triggers
    await vi.advanceTimersByTimeAsync(1);
    expect(clipboardContent).toBe('');
    expect(writeTextMock).toHaveBeenCalledWith('');
  });

  it('does not overwrite clipboard if user copied something else in between', async () => {
    await copySecret('secret-one', 1000);
    expect(clipboardContent).toBe('secret-one');

    // User copied something else externally
    clipboardContent = 'unrelated-clipboard-data';

    await vi.advanceTimersByTimeAsync(1000);
    // Should NOT have cleared because readText returned different content
    expect(clipboardContent).toBe('unrelated-clipboard-data');
  });

  it('immediately wipes on clearClipboard()', async () => {
    await copySecret('temp-secret', 5000);
    expect(clipboardContent).toBe('temp-secret');

    await clearClipboard();
    expect(clipboardContent).toBe('');
  });
});


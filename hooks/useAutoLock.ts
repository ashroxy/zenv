// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import { useEffect, useRef, useState } from 'react';

const AUTO_LOCK_TIME = 2 * 60 * 1000;
const IDLE_POLL_MS = 10_000;

interface UseAutoLockOptions {
  masterKey: string;
  showIntro: boolean;
  setShowIntro: (show: boolean) => void;
  onLock: () => void;
}

export function useAutoLock({
  masterKey,
  showIntro,
  setShowIntro,
  onLock,
}: UseAutoLockOptions) {
  const [isPrivacyActive, setIsPrivacyActive] = useState(false);
  const lastActive = useRef<number>(0);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    lastActive.current = Date.now();
  }, []);

  const dismissPrivacy = () => {
    setIsPrivacyActive(false);
    lastActive.current = Date.now();
  };

  useEffect(() => {
    const handleActivity = () => {
      lastActive.current = Date.now();
      if (document.visibilityState === 'visible' && !showIntro) {
        setIsPrivacyActive(false);
      }
    };

    const checkIdle = () => {
      if (masterKey && Date.now() - lastActive.current > AUTO_LOCK_TIME) {
        onLock();
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPrivacyActive(true);
        // SECURITY: `pagehide` is not guaranteed on Android app switches -
        // it fires on navigation and unload, not every backgrounding. The
        // key must go here, where `visibilitychange` is what actually fires
        // when the app-switcher snapshot is taken.
        onLock();
      } else {
        setShowIntro(true);
        setIsPrivacyActive(false);
        handleActivity();
      }
    };

    const handleHide = () => {
      if (document.hidden) {
        setIsPrivacyActive(true);
        onLock();
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') handleActivity();
    };
    const handleBlur = () => setIsPrivacyActive(true);

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleHide);
    idleTimer.current = window.setInterval(checkIdle, IDLE_POLL_MS);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleHide);
      if (idleTimer.current !== null) {
        window.clearInterval(idleTimer.current);
        idleTimer.current = null;
      }
    };
  }, [masterKey, showIntro, onLock, setShowIntro]);

  return {
    isPrivacyActive,
    dismissPrivacy,
  };
}

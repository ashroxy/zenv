import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PasswordRecipe, TabView, UserProfile } from './types';
import {
  getStoredRecipes,
  saveRecipes,
  getUsers,
  addUser,
  deleteUser,
  unlockStorage,
  lockStorage,
  wipeRecipes,
} from './services/storageService';
import { identityKey, isDuplicateOf } from './services/passwordGenerator';
import { clearClipboard } from './services/clipboard';

import Vault from './components/Vault';
import Generator from './components/Generator';
import SettingsPage from './components/Settings';
import Manual from './components/Manual';
import EditAccountModal from './components/EditAccountModal';
import Intro from './components/Intro';
import UserSelect from './components/UserSelect';
import ErrorBoundary from './components/ErrorBoundary';
import { Shield, Key, Settings as SettingsIcon, BookOpen, EyeOff } from './components/Icons';

const AUTO_LOCK_TIME = 2 * 60 * 1000;
const IDLE_POLL_MS = 10_000;
/** Debounce before deriving a key from the master-key field, so a fast typist
 *  triggers one PBKDF2 run instead of one per keystroke. */
const UNLOCK_DEBOUNCE_MS = 250;

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [activeTab, setActiveTab] = useState<TabView>('vault');
  const [recipes, setRecipes] = useState<PasswordRecipe[]>([]);
  const [masterKey, setMasterKey] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PasswordRecipe | null>(null);
  const [isPrivacyActive, setIsPrivacyActive] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  // `Date.now()` in the useRef initializer is an impure call during render.
  // Start at 0 and seed it in the mount effect below.
  const lastActive = useRef<number>(0);
  const idleTimer = useRef<number | null>(null);

  /**
   * Guards against a stale async load overwriting newer state.
   *
   * The previous version had two effects that both wrote recipes: one on
   * profile change, one on every recipe change. Switching profiles fast enough
   * let the first profile's load resolve after the second, showing one
   * profile's secrets under another's name.
   */
  const loadToken = useRef(0);
  const profileId = currentUser?.id ?? null;

  /**
   * The profile whose recipes are currently in `recipes` and safe to persist.
   *
   * This must be set only when a load for `profileId` has *completed*. Setting
   * it in an effect keyed on `profileId` (as before) ran in the same commit as
   * the load effect, so the save effect below passed its guard while `recipes`
   * still held the PREVIOUS profile's array and wrote that array into the new
   * profile's slot.
   */
  const loadedFor = useRef<string | null>(null);
  /** Set when the last load failed because the vault is locked/undecryptable. */
  const needsUnlock = useRef(false);
  /** Bumped to re-open the vault after a successful unlock. */
  const [reloadToken, setReloadToken] = useState(0);
  const previousProfileId = useRef<string | null>(null);

  // Initialize Users and seed the idle clock.
  useEffect(() => {
    lastActive.current = Date.now();
    setAllUsers(getUsers());
  }, []);

  // Reset session state when the profile really changes. Deliberately separate
  // from the load effect so that a plain reload (after unlock) does not wipe
  // the master key the user just typed.
  useEffect(() => {
    if (previousProfileId.current === profileId) return;
    previousProfileId.current = profileId;
    lockStorage();
    loadedFor.current = null;
    needsUnlock.current = false;
    setMasterKey('');
    setRecipes([]);
    setActiveTab('vault');
    setVaultError(null);
  }, [profileId]);

  // Load Recipes when the profile changes, or when a reload is requested.
  useEffect(() => {
    const token = ++loadToken.current;
    let cancelled = false;

    if (!profileId) return;

    void (async () => {
      try {
        const loaded = await getStoredRecipes(profileId);
        if (cancelled || token !== loadToken.current) return;
        // Only now is the vault open: publishing the id to the save gate and
        // the array together keeps the next persist effect a no-op rewrite.
        loadedFor.current = profileId;
        needsUnlock.current = false;
        setVaultError(null);
        setRecipes(loaded);
      } catch (err) {
        if (cancelled || token !== loadToken.current) return;
        const message = err instanceof Error ? err.message : 'Could not open this vault.';
        // A decryption failure must be visible, never an empty vault.
        needsUnlock.current = /locked|cannot be decrypted|master key/i.test(message);
        loadedFor.current = null;
        setVaultError(message);
      }
    })();

    return () => { cancelled = true; };
  }, [profileId, reloadToken]);

  // Persist on change, but only once a load has completed. Writing the empty
  // initial state would have wiped a vault whose recipes were still loading.
  useEffect(() => {
    if (!profileId) return;
    if (loadedFor.current !== profileId) return;
    void saveRecipes(profileId, recipes);
  }, [recipes, profileId]);

  // Install the at-rest key whenever the master key changes, and re-open the
  // vault once it is actually installed.
  useEffect(() => {
    if (!profileId || !masterKey) {
      lockStorage();
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void unlockStorage(masterKey)
        .then(() => {
          if (cancelled) return;
          // The vault could not be read without a key (or was just locked), so
          // this unlock is what makes it readable again.
          if (needsUnlock.current) setReloadToken((n) => n + 1);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // A rejected derivation (e.g. below the entropy floor) must surface,
          // not vanish as an unhandled rejection.
          setVaultError(err instanceof Error ? err.message : 'That master key was rejected.');
        });
    }, UNLOCK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [masterKey, profileId]);

  // User Management Handlers
  const handleCreateUser = (name: string) => {
    const newUser = addUser(name);
    setAllUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser); // Auto login
  };

  const handleDeleteUser = (id: string) => {
    deleteUser(id);
    setAllUsers(prev => prev.filter(u => u.id !== id));
    if (currentUser?.id === id) {
      setCurrentUser(null);
    }
  };

  const handleSwitchUser = () => {
      setMasterKey('');
      setCurrentUser(null);
      setActiveTab('vault');
  };

  // Lock: drop the key, the at-rest key, and every plaintext in child state.
  const lock = useCallback(() => {
    setMasterKey('');
    lockStorage();
    void clearClipboard();
    setRecipes([]); // re-read on next unlock
    loadedFor.current = null;
    // The vault is now genuinely unreadable, so the next successful unlock must
    // trigger a reload. Without this the emptied vault stayed empty forever.
    needsUnlock.current = true;
  }, []);

  // Security & Visibility Logic
  useEffect(() => {
    const handleActivity = () => {
        lastActive.current = Date.now();
        if (document.visibilityState === 'visible' && !showIntro) {
            setIsPrivacyActive(false);
        }
    };

    const checkIdle = () => {
        if (masterKey && (Date.now() - lastActive.current > AUTO_LOCK_TIME)) {
            lock();
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
            lock();
        } else {
            setShowIntro(true);
            setIsPrivacyActive(false);
            handleActivity();
        }
    };

    // SECURITY: hiding the app (app switcher snapshot, screen lock) must drop
    // the master key. The previous code only drew a blur overlay, leaving the
    // key in memory and in child component state.
    const handleHide = () => {
        if (document.hidden) {
            setIsPrivacyActive(true);
            lock();
        }
    };

    const handleFocus = () => {
        if (document.visibilityState === 'visible') handleActivity();
    };
    const handleBlur = () => setIsPrivacyActive(true);

    // Named references: the original cleanup passed fresh closures to
    // removeEventListener, which never matched and leaked a listener set per
    // master-key keystroke.
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
  }, [masterKey, showIntro, lock]);

  const handleAddAccount = (recipe: PasswordRecipe) => {
    if (editingRecipe) {
      setRecipes(prev => prev.map(r => r.id === recipe.id ? recipe : r));
    } else {
      setRecipes(prev => [...prev, recipe]);
    }
  };

  const handleSaveFromGenerator = (recipe: PasswordRecipe) => {
    // Identity duplicates were only checked in the edit modal, so saving the
    // same service+username twice from the Generator produced two entries that
    // the dedupe logic could never merge.
    const clash = isDuplicateOf(recipe, recipes);
    if (clash) {
      setVaultError(
        `${recipe.serviceName} / ${recipe.username} already exists as entry ${clash.counter}. ` +
          'Edit that entry instead of adding a second one.',
      );
      setIsModalOpen(true);
      setEditingRecipe(clash);
      return;
    }
    setRecipes(prev => [...prev, recipe]);
    setActiveTab('vault');
  };

  const handleDeleteAccount = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const handleWipe = async () => {
    if (!profileId) return;
    await wipeRecipes(profileId);
    setRecipes([]);
    lock();
  };

  const handleImport = (incoming: PasswordRecipe[], rejected: number) => {
    let identitySkipped = 0;
    setRecipes(prev => {
      // Merge by id: importing a backup must not silently drop local entries
      // and must not resurrect entries the user just deleted.
      const byId = new Map(prev.map(r => [r.id, r]));
      for (const r of incoming) byId.set(r.id, r);

      // A backup from another device can carry a different id for the same
      // service+username, so id-merging alone reintroduces identity duplicates.
      // First entry per identity wins; the later one is reported, not dropped
      // silently.
      const seen = new Set<string>();
      const merged: PasswordRecipe[] = [];
      for (const r of byId.values()) {
        const key = identityKey(r.serviceName, r.username);
        if (seen.has(key)) {
          identitySkipped++;
          continue;
        }
        seen.add(key);
        merged.push(r);
      }
      return merged;
    });

    if (identitySkipped > 0) {
      setVaultError(
        `Imported ${incoming.length - identitySkipped} new entries; ` +
          `${identitySkipped} duplicate ${identitySkipped === 1 ? 'entry was' : 'entries were'} ` +
          'skipped because that service and username already exist.',
      );
    } else if (rejected > 0) {
      setVaultError(`Imported with ${rejected} invalid ${rejected === 1 ? 'entry' : 'entries'} skipped.`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-background text-primary overflow-hidden relative selection:bg-white/20 pt-safe">

      {/* Intro */}
      {showIntro && <Intro onComplete={() => setShowIntro(false)} />}

      {/* Background Spotlight */}
      <div className="absolute inset-0 bg-spotlight pointer-events-none z-0"></div>

      {/* Privacy Overlay */}
      {isPrivacyActive && !showIntro && (
          <div
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-8 animate-fade-in cursor-pointer"
            onClick={() => {
                setIsPrivacyActive(false);
                lastActive.current = Date.now();
            }}
          >
              <div className="p-8 bg-surface rounded-full border border-white/10 shadow-glow mb-6 animate-pulse">
                  <EyeOff size={48} className="text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Locked</h2>
              <p className="text-secondary text-sm">Tap to resume session</p>
          </div>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 overflow-hidden relative z-10 transition-opacity duration-500 ${isPrivacyActive ? 'opacity-0' : 'opacity-100'}`}>
        {!currentUser && !showIntro ? (
            <UserSelect
                users={allUsers}
                onSelect={setCurrentUser}
                onCreate={handleCreateUser}
                onDelete={handleDeleteUser}
            />
        ) : currentUser ? (
            <>
                {vaultError && (
                  <div role="alert" className="mx-4 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-start gap-2">
                    <span className="flex-1">{vaultError}</span>
                    <button onClick={() => setVaultError(null)} className="text-red-300/70 hover:text-red-200" aria-label="Dismiss">&times;</button>
                  </div>
                )}
                {activeTab === 'vault' && (
                <ErrorBoundary>
                  <Vault
                    recipes={recipes}
                    onAdd={() => { setEditingRecipe(null); setIsModalOpen(true); }}
                    onEdit={(r) => { setEditingRecipe(r); setIsModalOpen(true); }}
                    onDelete={handleDeleteAccount}
                    masterKey={masterKey}
                    setMasterKey={setMasterKey}
                    userProfile={currentUser}
                  />
                </ErrorBoundary>
                )}
                {activeTab === 'generator' && (
                <ErrorBoundary>
                  <Generator
                    masterKey={masterKey}
                    setMasterKey={setMasterKey}
                    userProfile={currentUser}
                    onSaveToVault={handleSaveFromGenerator}
                  />
                </ErrorBoundary>
                )}
                {activeTab === 'manual' && <Manual />}
                {activeTab === 'settings' && (
                <ErrorBoundary>
                  <SettingsPage
                    recipes={recipes}
                    onImport={handleImport}
                    onWipe={handleWipe}
                    onLock={lock}
                    onSwitchUser={handleSwitchUser}
                    currentUser={currentUser}
                  />
                </ErrorBoundary>
                )}
            </>
        ) : null}
      </main>

      {/* Navigation - Only show if logged in */}
      {currentUser && !showIntro && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-all duration-500 ${isPrivacyActive ? 'translate-y-full' : 'translate-y-0'}`}>
            <nav className="mx-auto max-w-md bg-surface/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl flex justify-between items-center px-6 py-4">
                {[
                    { id: 'vault', icon: Shield, label: 'Vault' },
                    { id: 'generator', icon: Key, label: 'Gen' },
                    { id: 'manual', icon: BookOpen, label: 'Guide' },
                    { id: 'settings', icon: SettingsIcon, label: 'Settings' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as TabView)}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                            activeTab === item.id
                            ? 'text-white scale-110'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                    <item.icon size={24} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
      )}

      {/* Edit Modal */}
      {currentUser && (
          <EditAccountModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleAddAccount}
            initialData={editingRecipe}
            existingRecipes={recipes}
            profileId={currentUser.id}
            masterKey={masterKey}
          />
      )}
    </div>
  );
};

export default App;
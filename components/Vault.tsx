// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PasswordRecipe, UserProfile } from '../types';
import { Plus, Search, Copy, Eye, EyeOff, Shield, Trash2, Key } from './Icons';
import { deriveForRecipe, needsDerivationUpgrade } from '../services/passwordGenerator';
import { copySecret } from '../services/clipboard';

interface VaultProps {
  recipes: PasswordRecipe[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (recipe: PasswordRecipe) => void;
  masterKey: string;
  setMasterKey?: (key: string) => void;
  userProfile: UserProfile;
}

/** How long a revealed password stays on screen before it is hidden again. */
const REVEAL_TIMEOUT_MS = 30_000;

const Vault: React.FC<VaultProps> = ({ recipes, onAdd, onDelete, onEdit, masterKey, setMasterKey, userProfile }) => {
  const [search, setSearch] = useState('');
  const [quickKey, setQuickKey] = useState('');
  const [showQuickKey, setShowQuickKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  // Timers are refs so a pending timeout survives re-render but is always
  // cancellable; leaving them in component state caused "setState on an
  // unmounted component" warnings and, worse, a stale timer could re-hide a
  // password that had just been re-revealed.
  const timers = useRef<Set<number>>(new Set());

  const later = useCallback((fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const cancelAll = useCallback((): void => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  const showMessage = useCallback((msg: string): void => {
    setMessage(msg);
    later(() => setMessage(null), 2500);
  }, [later]);

  // SECURITY: plaintext passwords must not outlive the session that revealed
  // them. The original code left every revealed password in component state
  // forever, so they survived profile switch, auto-lock and lock-screen.
  useEffect(() => {
    setRevealedPasswords({});
  }, [userProfile.id, masterKey]);

  // Cancel pending timers on unmount and whenever the vault is torn down.
  useEffect(() => cancelAll, [cancelAll]);

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = recipes.filter(r =>
    r.serviceName.toLowerCase().includes(trimmedSearch) ||
    r.username.toLowerCase().includes(trimmedSearch)
  );

  // Read through a local so TypeScript can narrow `undefined` away. The previous
  // inline `recipes[0] as PasswordRecipe` silenced the compiler while still
  // passing `undefined` at runtime, which threw on the empty vault rendered
  // right after a profile switch or a lock.
  const firstRecipe: PasswordRecipe | undefined = recipes[0];

  const derive = useCallback(
    async (recipe: PasswordRecipe): Promise<string> =>
      deriveForRecipe(recipe, masterKey, userProfile.id),
    [masterKey, userProfile.id],
  );

  const handleCopy = async (e: React.MouseEvent, recipe: PasswordRecipe) => {
    e.stopPropagation();
    if (!masterKey) return showMessage('Unlock Required: Enter Master Key in Generator');

    try {
      const pwd = await derive(recipe);
      await copySecret(pwd);
      if (navigator.vibrate) navigator.vibrate(10);
      setCopiedId(recipe.id);
      later(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
      showMessage(err instanceof Error ? err.message : 'Could not copy password');
    }
  };

  const handleReveal = async (e: React.MouseEvent, recipe: PasswordRecipe) => {
    e.stopPropagation();
    if (revealedPasswords[recipe.id]) {
      setRevealedPasswords(prev => {
        const next = { ...prev };
        delete next[recipe.id];
        return next;
      });
      return;
    }

    if (!masterKey) return showMessage('Unlock Required: Enter Master Key in Generator');

    try {
      const pwd = await derive(recipe);
      setRevealedPasswords(prev => ({ ...prev, [recipe.id]: pwd }));
      // Auto-hide: an unattended unlocked screen should not keep plaintext
      // visible indefinitely.
      later(() => {
        setRevealedPasswords(prev => {
          const next = { ...prev };
          delete next[recipe.id];
          return next;
        });
      }, REVEAL_TIMEOUT_MS);
    } catch (err) {
      console.error(err);
      showMessage(err instanceof Error ? err.message : 'Could not reveal password');
    }
  };

  const handleDelete = (e: React.MouseEvent, recipe: PasswordRecipe) => {
    e.stopPropagation();
    setRevealedPasswords(prev => {
      const next = { ...prev };
      delete next[recipe.id];
      return next;
    });
    onDelete(recipe.id);
  };

  // Generate a deterministic glossy gradient based on the service name
  const getAvatarStyle = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 40) % 360;
    return {
      background: `linear-gradient(135deg, hsl(${h1}, 70%, 55%), hsl(${h2}, 85%, 45%))`,
      boxShadow: `0 4px 15px hsl(${h1}, 70%, 55%, 0.3)`,
      textShadow: '0 1px 2px rgba(0,0,0,0.3)'
    };
  };

  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full font-sans">

      {/* Message Toast */}
      {message && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-surface border border-white/10 rounded-full shadow-glow animate-fade-in">
              <span className="text-sm text-white">{message}</span>
          </div>
      )}

      {/* Glossy Header */}
      <div className="px-6 pt-8 pb-4 sticky top-0 z-20 bg-background/80 backdrop-blur-xl">
        <div className="flex justify-between items-start mb-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                    {userProfile.name}'s <span className="text-zinc-500">Vault</span>
                </h1>
                <p className="text-sm text-zinc-500 font-medium">
                    {recipes.length} Secure Items
                    {firstRecipe !== undefined && needsDerivationUpgrade(firstRecipe) && (
                        <span className="ml-2 text-amber-400/80 text-xs">legacy derivation</span>
                    )}
                </p>
            </div>
            <button
                onClick={() => { if(navigator.vibrate) navigator.vibrate(10); onAdd(); }}
                className="bg-white text-black p-3 rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                aria-label="Add account"
            >
                <Plus size={24} strokeWidth={2.5} />
            </button>
        </div>

        {/* Search Pill */}
        <div className="relative group">
            <div className="absolute inset-0 bg-white/5 rounded-full blur-sm group-focus-within:bg-white/10 transition-all"></div>
            <div className="relative bg-surfaceHighlight border border-white/5 rounded-full flex items-center px-4 py-3">
                <Search className="text-zinc-500 mr-3" size={18} />
                <input
                    type="text"
                    placeholder="Search accounts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Search accounts"
                    className="bg-transparent w-full focus:outline-none text-white placeholder-zinc-500 text-sm font-medium"
                />
            </div>
        </div>
      </div>

{/* List Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-40 space-y-3">
        {!masterKey && setMasterKey && (
          <div className="bg-surface border border-white/10 rounded-[2rem] p-6 mb-2 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/5 rounded-full text-white"><Key size={20} /></div>
              <div>
                <h3 className="font-semibold text-white">Vault is Locked</h3>
                <p className="text-zinc-500 text-xs">Enter your Master Key to decrypt your accounts</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (quickKey) {
                  setMasterKey(quickKey);
                  setQuickKey('');
                }
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <input
                  type={showQuickKey ? 'text' : 'password'}
                  value={quickKey}
                  onChange={(e) => setQuickKey(e.target.value)}
                  placeholder="Enter Master Key..."
                  aria-label="Master key to unlock vault"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-black/40 border border-white/10 rounded-full px-5 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowQuickKey(!showQuickKey)}
                  className="absolute right-4 top-3 text-zinc-500 hover:text-white"
                  aria-label={showQuickKey ? 'Hide master key' : 'Show master key'}
                >
                  {showQuickKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={!quickKey}
                className="px-6 bg-white text-black font-bold rounded-full text-sm hover:bg-zinc-200 transition-colors disabled:opacity-40"
              >
                Unlock
              </button>
            </form>
          </div>
        )}

        {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600 space-y-4">
                <div className="p-6 rounded-full bg-surface border border-white/5">
                    {search ? <Search size={32} className="opacity-50" /> : <Shield size={32} className="opacity-50" />}
                </div>
                {search ? (
                  <div className="text-center space-y-2">
                    <p className="font-medium text-zinc-400 text-sm">No accounts matching &ldquo;{search}&rdquo;</p>
                    <button
                      onClick={() => setSearch('')}
                      className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-medium transition-colors"
                    >
                      Clear search
                    </button>
                  </div>
                ) : !masterKey ? (
                  <p className="font-medium text-sm text-zinc-500 max-w-xs text-center">
                    Enter your Master Key above to view and decrypt your saved accounts.
                  </p>
                ) : (
                  <p className="font-medium">No items in vault</p>
                )}
            </div>
        ) : (
            filtered.map((recipe) => {
                const revealed = revealedPasswords[recipe.id];
                const legacy = needsDerivationUpgrade(recipe);
                return (
                <div
                    key={recipe.id}
                    onClick={() => onEdit(recipe)}
                    className="group relative bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-[2rem] p-4 transition-all active:scale-[0.98] cursor-pointer"
                >
                    <div className="flex items-center gap-4">
                        {/* Unique Icon Container */}
                        <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm tracking-widest"
                            style={getAvatarStyle(recipe.serviceName)}
                        >
                            {getInitials(recipe.serviceName)}
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white text-base truncate">
                                {recipe.serviceName}
                            </h3>
                            <p className="text-zinc-500 text-xs truncate font-mono mt-0.5">
                                {recipe.username}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                             {revealed && (
                                <div className="absolute inset-0 bg-surfaceHighlight/95 backdrop-blur-md rounded-[2rem] z-10 flex items-center justify-between px-6 animate-fade-in">
                                    <span className="font-mono text-white text-sm tracking-wider select-all break-all">{revealed}</span>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => handleDelete(e, recipe)}
                                            className="p-2 bg-black/50 rounded-full text-red-400 hover:text-red-300"
                                            aria-label={`Delete ${recipe.serviceName}`}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); void handleReveal(e, recipe); }}
                                            className="p-2 bg-black/50 rounded-full text-zinc-400"
                                            aria-label="Hide password"
                                        >
                                            <EyeOff size={16} />
                                        </button>
                                    </div>
                                </div>
                             )}

                            {legacy && !revealed && (
                                <span
                                    className="self-center text-[10px] font-medium text-amber-400/80 border border-amber-400/30 rounded-full px-2 py-0.5"
                                    title="Created before the salt fix. Its password cannot be upgraded without changing it."
                                >
                                    v1
                                </span>
                            )}

                            <button
                                onClick={(e) => void handleReveal(e, recipe)}
                                className="p-3 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                aria-label={revealed ? `Hide ${recipe.serviceName} password` : `Reveal ${recipe.serviceName} password`}
                            >
                                {revealed ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                            <button
                                onClick={(e) => void handleCopy(e, recipe)}
                                className={`p-3 rounded-full hover:bg-white/10 transition-colors ${
                                    copiedId === recipe.id ? 'text-green-400' : 'text-zinc-400 hover:text-white'
                                }`}
                                aria-label={`Copy ${recipe.serviceName} password`}
                            >
                                <Copy size={20} />
                            </button>
                        </div>
                    </div>
                </div>
                );
            })
        )}
      </div>
    </div>
  );
};

export default Vault;

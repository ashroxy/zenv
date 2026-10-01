// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Copy, Check, AlertTriangle } from './Icons';
import { generateDeterministicPassword, estimateEntropyBits } from '../services/cryptoUtils';
import { CURRENT_DERIVATION_VERSION } from '../types';
import type { PasswordRecipe, UserProfile } from '../types';
import { MAX_COUNTER, MIN_MASTER_KEY_BITS, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '../services/limits';
import { copySecret } from '../services/clipboard';

interface GeneratorProps {
  masterKey: string;
  setMasterKey: (key: string) => void;
  userProfile: UserProfile;
  onSaveToVault?: (recipe: PasswordRecipe) => void;
}

/** Strength is derived from the master key's estimated entropy, not its length. */
const STRENGTH_STEPS = 5;
const strengthFromBits = (bits: number): number => {
  if (bits <= 0) return 0;
  const ratio = Math.min(1, bits / (MIN_MASTER_KEY_BITS * 1.5));
  return Math.max(1, Math.ceil(ratio * STRENGTH_STEPS));
};

const Generator: React.FC<GeneratorProps> = ({ masterKey, setMasterKey, userProfile, onSaveToVault }) => {
  const [showMaster, setShowMaster] = useState(false);
  const [service, setService] = useState('');
  const [username, setUsername] = useState('');
  const [length, setLength] = useState(16);
  const [generated, setGenerated] = useState('');
  const [displayPassword, setDisplayPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [counter, setCounter] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config
  const [useUppercase, setUseUpper] = useState(true);
  const [useLowercase, setUseLower] = useState(true);
  const [useNumbers, setUseNumber] = useState(true);
  const [useSpecial, setUseSpecial] = useState(true);

  const toggleClass = (current: boolean, setter: (v: boolean) => void) => {
    const activeCount = [useUppercase, useLowercase, useNumbers, useSpecial].filter(Boolean).length;
    if (current && activeCount <= 1) return; // Keep at least one class active
    setter(!current);
  };

  const timers = useRef<Set<number>>(new Set());
  const later = useCallback((fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  const keyBits = estimateEntropyBits(masterKey);
  const strength = strengthFromBits(keyBits);
  const keyTooWeak = masterKey.length > 0 && keyBits < MIN_MASTER_KEY_BITS;

  // Typing the master key must never leave a derived password on screen.
  useEffect(() => {
    setGenerated('');
    setDisplayPassword('');
  }, [masterKey, userProfile.id]);

  // Scramble reveal animation.
  useEffect(() => {
    if (!generated) {
        setDisplayPassword('');
        return;
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let iterations = 0;
    const interval = window.setInterval(() => {
        setDisplayPassword(generated.split('').map((_, i) =>
            i < iterations ? generated[i] : chars[Math.floor(Math.random() * chars.length)]).join('')
        );
        if (iterations >= generated.length) window.clearInterval(interval);
        iterations += 1;
    }, 30);
    return () => window.clearInterval(interval);
  }, [generated]);

  const requestGeneration = async () => {
    if (!masterKey || !service || !username) return;
    setError(null);
    setIsGenerating(true);
    try {
        // No artificial delay: PBKDF2 is the slow part and the spinner already
        // covers it. The previous 500ms sleep was added on top of real work.
        const pwd = await generateDeterministicPassword({
            masterKey,
            serviceName: service,
            username,
            profileId: userProfile.id,
            length,
            counter,
            classes: { useUppercase, useLowercase, useNumbers, useSpecial },
        });
        setGenerated(pwd);
        if (navigator.vibrate) navigator.vibrate(20);
    } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate a password.');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generated) return;
    try {
      await copySecret(generated);
      setCopied(true);
      later(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable. Reveal the password and copy it manually.');
    }
  };

  const handleSave = () => {
      if (!onSaveToVault) return;
      onSaveToVault({
          id: crypto.randomUUID(),
          serviceName: service,
          username,
          length,
          counter,
          color: '#fff',
          useLowercase,
          useUppercase,
          useNumbers,
          useSpecial,
          derivationVersion: CURRENT_DERIVATION_VERSION,
      });
  };

  return (
    <div className="h-full flex flex-col font-sans px-6 pt-8 pb-32 overflow-y-auto">

      <h1 className="text-3xl font-bold tracking-tight text-white mb-8">
          Generate <span className="text-zinc-400">Pass</span>
      </h1>

      <div className="space-y-6">
        {/* Master Key Input */}
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 relative overflow-hidden group">
            <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Master Key</span>
                {masterKey && (
                     <div className="flex gap-1" role="meter" aria-valuenow={strength} aria-valuemin={0} aria-valuemax={STRENGTH_STEPS} aria-label="Master key strength">
                         {[1,2,3,4,5].map(i => (
                             <div key={i} className={`h-1.5 w-4 rounded-full transition-colors ${i <= strength ? 'bg-white' : 'bg-white/10'}`}></div>
                         ))}
                     </div>
                )}
            </div>
            <div className="relative">
                <input
                    type={showMaster ? 'text' : 'password'}
                    value={masterKey}
                    onChange={(e) => setMasterKey(e.target.value)}
                    placeholder="Enter key..."
                    aria-label="Master key"
                    aria-invalid={keyTooWeak}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-black/30 border border-white/10 rounded-full px-6 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors font-mono tracking-wider"
                />
                <button
                    onClick={() => setShowMaster(!showMaster)}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-white"
                    aria-label={showMaster ? 'Hide master key' : 'Show master key'}
                >
                    {showMaster ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>
            {keyTooWeak && (
                <p className="mt-3 flex items-start gap-2 text-xs text-amber-400">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                        Too weak: about {keyBits} bits of entropy, {MIN_MASTER_KEY_BITS} required.
                        Lengthen it or add characters from more classes.
                    </span>
                </p>
            )}
        </div>

        {/* Inputs */}
        <div className="space-y-4">
             <div className="relative">
                 <input
                    value={service}
                    onChange={e => setService(e.target.value)}
                    placeholder="Website (e.g. google.com)"
                    aria-label="Website or service name"
                    className="w-full bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-full px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all"
                 />
             </div>
             <div className="relative">
                 <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username / Email"
                    aria-label="Username or email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-full px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all"
                 />
             </div>
        </div>

        {/* Options */}
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 space-y-6">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-300">Length: {length}</span>
                <input
                    type="range"
                    min={MIN_PASSWORD_LENGTH}
                    max={MAX_PASSWORD_LENGTH}
                    value={length}
                    onChange={e => setLength(parseInt(e.target.value, 10))}
                    aria-label="Password length"
                    className="w-1/2"
                />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-300">Version: {counter}</span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCounter(Math.max(1, counter-1))}
                        disabled={counter <= 1}
                        aria-label="Decrease version"
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-40"
                    >-</button>
                    <button
                        onClick={() => setCounter(Math.min(MAX_COUNTER, counter+1))}
                        disabled={counter >= MAX_COUNTER}
                        aria-label="Increase version"
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-40"
                    >+</button>
                </div>
            </div>
            <div className="flex justify-between gap-2">
                {[
                    { l: 'ABC', v: useUppercase, s: setUseUpper, name: 'uppercase' },
                    { l: 'abc', v: useLowercase, s: setUseLower, name: 'lowercase' },
                    { l: '123', v: useNumbers, s: setUseNumber, name: 'numbers' },
                    { l: '#!?', v: useSpecial, s: setUseSpecial, name: 'symbols' },
                ].map((opt) => (
                    <button
                        key={opt.name}
                        onClick={() => toggleClass(opt.v, opt.s)}
                        aria-pressed={opt.v}
                        aria-label={`Toggle ${opt.name}`}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${opt.v ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10'}`}
                    >
                        {opt.l}
                    </button>
                ))}
            </div>
        </div>

        {/* Generate Button */}
        <button
            onClick={requestGeneration}
            disabled={!masterKey || !service || !username || isGenerating || keyTooWeak}
            className="w-full bg-white text-black font-bold py-5 rounded-full shadow-glow active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg tracking-wide"
        >
            {isGenerating ? 'Computing...' : 'Generate Password'}
        </button>

        {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-red-400 bg-surface border border-red-500/20 rounded-2xl px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
            </p>
        )}

        {/* Result Area */}
        {generated && (
             <div className="animate-float mt-4 bg-surfaceHighlight border border-white/10 rounded-[2rem] p-8 text-center relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-50"></div>
                 <div className="font-mono text-2xl text-white mb-4 break-all">{displayPassword}</div>
                 <div className="flex justify-center gap-4">
                     <button onClick={() => void handleCopy()} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                        {copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy'}
                     </button>
                     <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                        Save
                     </button>
                 </div>
             </div>
        )}
      </div>
    </div>
  );
};

export default Generator;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENT_DERIVATION_VERSION } from '../types';
import type { PasswordRecipe } from '../types';
import { Check, AlertTriangle, Key, Eye, EyeOff, Copy } from './Icons';
import { generateDeterministicPassword, MasterKeyTooWeakError } from '../services/cryptoUtils';
import { isDuplicateOf, recipeDerivationVersion } from '../services/passwordGenerator';
import { MAX_NOTES_LENGTH, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, MAX_COUNTER } from '../services/limits';
import { copySecret } from '../services/clipboard';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (recipe: PasswordRecipe) => void;
    initialData?: PasswordRecipe | null;
    existingRecipes?: PasswordRecipe[];
    /** The profile the recipe belongs to; part of the v2 derivation salt. */
    profileId: string;
    /** Master key if already entered in session. */
    masterKey?: string;
}

const EditAccountModal: React.FC<ModalProps> = ({ isOpen, onClose, onSave, initialData, existingRecipes = [], profileId, masterKey = '' }) => {
    const [serviceName, setServiceName] = useState('');
    const [username, setUsername] = useState('');
    const [length, setLength] = useState(16);
    const [counter, setCounter] = useState(1);
    const [useLowercase, setUseLower] = useState(true);
    const [useUppercase, setUseUpper] = useState(true);
    const [useNumbers, setUseNumber] = useState(true);
    const [useSpecial, setUseSpecial] = useState(true);
    const [notes, setNotes] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

    // Decrypt state
    const [decryptKey, setDecryptKey] = useState('');
    const [showDecryptKey, setShowDecryptKey] = useState(false);
    const [decryptedPassword, setDecryptedPassword] = useState('');
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [justCopied, setJustCopied] = useState(false);
    const [revealError, setRevealError] = useState<string | null>(null);

    const timers = useRef<Set<number>>(new Set());
    const later = useCallback((fn: () => void, ms: number): void => {
        const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
        timers.current.add(id);
    }, []);
    useEffect(() => () => {
        for (const id of timers.current) window.clearTimeout(id);
        timers.current.clear();
    }, []);

    // A v1 recipe must keep deriving with v1 parameters, otherwise editing it
    // would silently rotate the password to a different value.
    const preservedVersion = initialData ? recipeDerivationVersion(initialData) : CURRENT_DERIVATION_VERSION;
    const isLegacy = preservedVersion === 1;

    useEffect(() => {
        if (initialData) {
            setServiceName(initialData.serviceName);
            setUsername(initialData.username);
            setLength(initialData.length);
            setCounter(initialData.counter);
            setUseLower(initialData.useLowercase);
            setUseUpper(initialData.useUppercase);
            setUseNumber(initialData.useNumbers);
            setUseSpecial(initialData.useSpecial);
            setNotes(initialData.additionalNotes || '');
        } else {
            setServiceName(''); setUsername(''); setLength(16); setCounter(1);
            setUseLower(true); setUseUpper(true); setUseNumber(true); setUseSpecial(true); setNotes('');
        }
        // Reset local decrypt state on open
        setDecryptKey(masterKey || '');
        setDecryptedPassword('');
        setShowDecryptKey(false);
        setFormError(null);
        setRevealError(null);
    }, [initialData, isOpen, masterKey]);

    // SECURITY: the decrypted password must not survive the modal closing or
    // the recipe changing underneath it.
    useEffect(() => () => setDecryptedPassword(''), [initialData, isOpen]);

    // Navigating away clears the key, which must also drop the plaintext.
    useEffect(() => {
        if (decryptKey) setDecryptedPassword('');
    }, [decryptKey]);

    if (!isOpen) return null;

    const handleSave = () => {
        setFormError(null);

        if (!serviceName.trim() || !username.trim()) {
            setFormError('Website and username are both required.');
            return;
        }
        const duplicate = isDuplicateOf({ serviceName, username }, existingRecipes, initialData?.id);
        if (duplicate) {
            // Previously two recipes could share an identity; the v2 salt makes
            // them derive different passwords, so the vault looked like it had
            // two entries for the same account with unrelated secrets.
            setFormError(
                `A "${duplicate.serviceName}" / ${duplicate.username} entry already exists. ` +
                'Duplicate entries derive different passwords for the same account.',
            );
            return;
        }
        if (notes.length > MAX_NOTES_LENGTH) {
            setFormError(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
            return;
        }

        const newRecipe: PasswordRecipe = {
            id: initialData?.id || crypto.randomUUID(),
            serviceName: serviceName.trim(),
            username: username.trim(),
            length,
            counter,
            color: initialData?.color ?? '',
            useLowercase, useUppercase, useNumbers, useSpecial,
            additionalNotes: notes,
            // Preserve an existing v1 recipe's version; new entries are v2.
            derivationVersion: preservedVersion,
        };
        onSave(newRecipe);
        onClose();
    };

    const handleDecrypt = async () => {
        if (!decryptKey) return;
        setRevealError(null);
        setIsDecrypting(true);
        try {
            const pwd = await generateDeterministicPassword({
                masterKey: decryptKey,
                serviceName,
                username,
                profileId,
                length,
                counter,
                classes: { useLowercase, useUppercase, useNumbers, useSpecial },
                derivationVersion: preservedVersion,
            });
            setDecryptedPassword(pwd);
        } catch (error) {
            setRevealError(
                error instanceof MasterKeyTooWeakError
                    ? `That key is too weak to be a master key (${error.bits} of ${error.required} bits).`
                    : error instanceof Error ? error.message : 'Could not derive a password.',
            );
        } finally {
            setIsDecrypting(false);
        }
    };

    const copyToClipboard = async () => {
        if (!decryptedPassword) return;
        try {
            await copySecret(decryptedPassword);
            setJustCopied(true);
            later(() => setJustCopied(false), 2000);
        } catch {
            setRevealError('Clipboard unavailable. Select the password and copy it manually.');
        }
    };

    const toggleClass = (current: boolean, setter: (v: boolean) => void) => {
        const activeCount = [useUppercase, useLowercase, useNumbers, useSpecial].filter(Boolean).length;
        if (current && activeCount <= 1) return; // Keep at least one class active
        setter(!current);
    };

    const classes = [
        { l: 'AZ', v: useUppercase, s: setUseUpper, name: 'uppercase' },
        { l: 'az', v: useLowercase, s: setUseLower, name: 'lowercase' },
        { l: '09', v: useNumbers, s: setUseNumber, name: 'numbers' },
        { l: '#!', v: useSpecial, s: setUseSpecial, name: 'symbols' },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full sm:max-w-lg bg-[#1c1c1e] rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden animate-slide-up">

                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{initialData ? 'Edit Item' : 'New Item'}</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none" aria-label="Close">&times;</button>
                </div>

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {isLegacy && (
                        <p className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-2xl px-4 py-3">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>
                                Created before the salt fix. Its password cannot change without breaking the
                                existing account, so it keeps the legacy derivation.
                            </span>
                        </p>
                    )}

                    <input
                        value={serviceName} onChange={e => setServiceName(e.target.value)}
                        placeholder="Website"
                        aria-label="Website"
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
                    />
                    <input
                        value={username} onChange={e => setUsername(e.target.value)}
                        placeholder="Username"
                        aria-label="Username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
                    />
                    <textarea
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Notes (Optional)"
                        aria-label="Notes"
                        maxLength={MAX_NOTES_LENGTH}
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none h-24"
                    />

                    <div className="bg-black/30 rounded-2xl p-4 space-y-4">
                        <div className="flex justify-between items-center text-sm text-zinc-400">
                            <span>Length: {length}</span>
                            <div className="flex items-center gap-2">
                                <span>Version: {counter}</span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCounter(Math.max(1, counter - 1))}
                                        disabled={counter <= 1}
                                        aria-label="Decrease version"
                                        className="w-6 h-6 rounded-full bg-white/10 text-white text-xs flex items-center justify-center disabled:opacity-40 hover:bg-white/20"
                                    >-</button>
                                    <button
                                        type="button"
                                        onClick={() => setCounter(Math.min(MAX_COUNTER, counter + 1))}
                                        disabled={counter >= MAX_COUNTER}
                                        aria-label="Increase version"
                                        className="w-6 h-6 rounded-full bg-white/10 text-white text-xs flex items-center justify-center disabled:opacity-40 hover:bg-white/20"
                                    >+</button>
                                </div>
                            </div>
                        </div>
                        <input
                            type="range" min={MIN_PASSWORD_LENGTH} max={MAX_PASSWORD_LENGTH}
                            value={length}
                            onChange={e => setLength(parseInt(e.target.value, 10))}
                            aria-label="Password length"
                            className="w-full"
                        />
                        <div className="flex gap-2">
                             {classes.map((o) => (
                                 <button
                                     key={o.name}
                                     type="button"
                                     onClick={() => toggleClass(o.v, o.s)}
                                     aria-pressed={o.v}
                                     aria-label={`Toggle ${o.name}`}
                                     className={`flex-1 py-2 rounded-lg text-xs font-bold border ${o.v ? 'bg-white text-black' : 'bg-transparent text-zinc-500 border-white/10'}`}
                                 >{o.l}</button>
                             ))}
                        </div>
                    </div>

                    {/* Decrypt / Reveal Section */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                            <Key size={12} /> Master Reveal
                        </h4>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type={showDecryptKey ? 'text' : 'password'}
                                    value={decryptKey}
                                    onChange={e => setDecryptKey(e.target.value)}
                                    placeholder="Enter Master Key"
                                    aria-label="Master key to reveal"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30"
                                />
                                <button
                                    onClick={() => setShowDecryptKey(!showDecryptKey)}
                                    className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                                    aria-label={showDecryptKey ? 'Hide master key' : 'Show master key'}
                                >
                                    {showDecryptKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button
                                onClick={() => void handleDecrypt()}
                                disabled={!decryptKey || isDecrypting}
                                className="px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                {isDecrypting ? '...' : 'Reveal'}
                            </button>
                        </div>
                        {revealError && (
                            <p role="alert" className="text-xs text-red-400">{revealError}</p>
                        )}
                        {decryptedPassword && (
                            <div className="p-3 bg-black/50 border border-white/10 rounded-xl flex items-center justify-between animate-fade-in">
                                <span className="font-mono text-white text-sm break-all select-all">{decryptedPassword}</span>
                                <button
                                    onClick={copyToClipboard}
                                    className={`ml-2 p-2 rounded-lg transition-colors ${justCopied ? 'text-green-500 bg-green-500/10' : 'text-zinc-400 hover:text-white'}`}
                                    aria-label="Copy password"
                                >
                                    {justCopied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 pt-2 bg-[#1c1c1e] z-10 relative space-y-3">
                    {formError && (
                        <p role="alert" className="flex items-start gap-2 text-sm text-red-400">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <span>{formError}</span>
                        </p>
                    )}
                    <button onClick={handleSave} className="w-full bg-white text-black font-bold py-4 rounded-full shadow-glow">
                        Save Item
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditAccountModal;
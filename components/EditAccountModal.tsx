import React, { useState, useEffect } from 'react';
import { PasswordRecipe } from '../types';
import { Check, AlertTriangle, Key, Eye, EyeOff, Copy } from './Icons';
import { generateDeterministicPassword } from '../services/cryptoUtils';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (recipe: PasswordRecipe) => void;
    initialData?: PasswordRecipe | null;
    existingRecipes?: PasswordRecipe[];
}

const EditAccountModal: React.FC<ModalProps> = ({ isOpen, onClose, onSave, initialData, existingRecipes = [] }) => {
    const [serviceName, setServiceName] = useState('');
    const [username, setUsername] = useState('');
    const [length, setLength] = useState(16);
    const [counter, setCounter] = useState(1);
    const [useLower, setUseLower] = useState(true);
    const [useUpper, setUseUpper] = useState(true);
    const [useNumber, setUseNumber] = useState(true);
    const [useSpecial, setUseSpecial] = useState(true);
    const [notes, setNotes] = useState('');

    // Decrypt state
    const [decryptKey, setDecryptKey] = useState('');
    const [showDecryptKey, setShowDecryptKey] = useState(false);
    const [decryptedPassword, setDecryptedPassword] = useState('');
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [justCopied, setJustCopied] = useState(false);

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
        setDecryptKey('');
        setDecryptedPassword('');
        setShowDecryptKey(false);
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!serviceName.trim() || !username.trim()) return;
        const newRecipe: PasswordRecipe = {
            id: initialData?.id || crypto.randomUUID(),
            serviceName, username, length, counter, color: '',
            useLowercase: useLower, useUppercase: useUpper, useNumbers: useNumber, useSpecial: useSpecial,
            additionalNotes: notes
        };
        onSave(newRecipe); onClose();
    };

    const handleDecrypt = async () => {
        if (!decryptKey) return;
        setIsDecrypting(true);
        try {
            const pwd = await generateDeterministicPassword(
                decryptKey,
                serviceName,
                username,
                length,
                counter,
                { useLower, useUpper, useNumber, useSpecial }
            );
            setDecryptedPassword(pwd);
        } catch (error) {
            console.error(error);
        } finally {
            setIsDecrypting(false);
        }
    };

    const copyToClipboard = () => {
        if(decryptedPassword) {
            navigator.clipboard.writeText(decryptedPassword);
            setJustCopied(true);
            setTimeout(() => setJustCopied(false), 2000);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full sm:max-w-lg bg-[#1c1c1e] rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden animate-slide-up">
                
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{initialData ? 'Edit Item' : 'New Item'}</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white text-2xl leading-none">&times;</button>
                </div>
                
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <input 
                        value={serviceName} onChange={e => setServiceName(e.target.value)}
                        placeholder="Website"
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
                    />
                    <input 
                        value={username} onChange={e => setUsername(e.target.value)}
                        placeholder="Username"
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
                    />
                    <textarea 
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Notes (Optional)"
                        className="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/20 resize-none h-24"
                    />

                    <div className="bg-black/30 rounded-2xl p-4 space-y-4">
                        <div className="flex justify-between text-sm text-zinc-400">
                            <span>Length: {length}</span>
                            <span>Version: {counter}</span>
                        </div>
                        <input type="range" min="8" max="32" value={length} onChange={e => setLength(parseInt(e.target.value))} className="w-full" />
                        <div className="flex gap-2">
                             {[
                                { l: 'AZ', v: useUpper, s: setUseUpper },
                                { l: 'az', v: useLower, s: setUseLower },
                                { l: '09', v: useNumber, s: setUseNumber },
                                { l: '#!', v: useSpecial, s: setUseSpecial }
                             ].map((o, i) => (
                                 <button key={i} onClick={() => o.s(!o.v)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${o.v ? 'bg-white text-black' : 'bg-transparent text-zinc-500 border-white/10'}`}>{o.l}</button>
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
                                    type={showDecryptKey ? "text" : "password"}
                                    value={decryptKey}
                                    onChange={e => setDecryptKey(e.target.value)}
                                    placeholder="Enter Master Key"
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30"
                                />
                                <button
                                    onClick={() => setShowDecryptKey(!showDecryptKey)}
                                    className="absolute right-3 top-3 text-zinc-500 hover:text-white"
                                >
                                    {showDecryptKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button
                                onClick={handleDecrypt}
                                disabled={!decryptKey || isDecrypting}
                                className="px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                {isDecrypting ? '...' : 'Decrypt'}
                            </button>
                        </div>
                        {decryptedPassword && (
                            <div className="p-3 bg-black/50 border border-white/10 rounded-xl flex items-center justify-between animate-fade-in">
                                <span className="font-mono text-white text-sm break-all select-all">{decryptedPassword}</span>
                                <button
                                    onClick={copyToClipboard}
                                    className={`ml-2 p-2 rounded-lg transition-colors ${justCopied ? 'text-green-500 bg-green-500/10' : 'text-zinc-400 hover:text-white'}`}
                                >
                                    {justCopied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 pt-2 bg-[#1c1c1e] z-10 relative">
                    <button onClick={handleSave} className="w-full bg-white text-black font-bold py-4 rounded-full shadow-glow">
                        Save Item
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditAccountModal;
import React, { useState } from 'react';
import { PasswordRecipe, UserProfile } from '../types';
import { Plus, Search, Copy, Eye, EyeOff, Shield } from './Icons';
import { generateDeterministicPassword } from '../services/cryptoUtils';

interface VaultProps {
  recipes: PasswordRecipe[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (recipe: PasswordRecipe) => void;
  masterKey: string;
  userProfile: UserProfile;
}

const Vault: React.FC<VaultProps> = ({ recipes, onAdd, onDelete, onEdit, masterKey, userProfile }) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});

  const filtered = recipes.filter(r => 
    r.serviceName.toLowerCase().includes(search.toLowerCase()) || 
    r.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = async (e: React.MouseEvent, recipe: PasswordRecipe) => {
    e.stopPropagation();
    if (!masterKey) return alert("Unlock Required: Please enter Master Key in Generator.");
    
    try {
      const pwd = await generateDeterministicPassword(
        masterKey, recipe.serviceName, recipe.username, recipe.length, recipe.counter,
        { useLower: recipe.useLowercase, useUpper: recipe.useUppercase, useNumber: recipe.useNumbers, useSpecial: recipe.useSpecial }
      );
      await navigator.clipboard.writeText(pwd);
      if(navigator.vibrate) navigator.vibrate(10);
      setCopiedId(recipe.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) { console.error(err); }
  };

  const handleReveal = async (e: React.MouseEvent, recipe: PasswordRecipe) => {
    e.stopPropagation();
    if (revealedPasswords[recipe.id]) {
        const next = {...revealedPasswords};
        delete next[recipe.id];
        setRevealedPasswords(next);
        return;
    }

    if (!masterKey) return alert("Unlock Required: Please enter Master Key in Generator.");

    try {
        const pwd = await generateDeterministicPassword(
            masterKey, recipe.serviceName, recipe.username, recipe.length, recipe.counter,
            { useLower: recipe.useLowercase, useUpper: recipe.useUppercase, useNumber: recipe.useNumbers, useSpecial: recipe.useSpecial }
        );
        setRevealedPasswords(prev => ({...prev, [recipe.id]: pwd}));
    } catch(e) { console.error(e); }
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
      
      {/* Glossy Header */}
      <div className="px-6 pt-8 pb-4 sticky top-0 z-20 bg-background/80 backdrop-blur-xl">
        <div className="flex justify-between items-start mb-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
                    {userProfile.name}'s <span className="text-zinc-500">Vault</span>
                </h1>
                <p className="text-sm text-zinc-500 font-medium">
                    {recipes.length} Secure Items
                </p>
            </div>
            <button 
                onClick={() => { if(navigator.vibrate) navigator.vibrate(10); onAdd(); }}
                className="bg-white text-black p-3 rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]"
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
                    className="bg-transparent w-full focus:outline-none text-white placeholder-zinc-500 text-sm font-medium"
                />
            </div>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-3">
        {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-600 space-y-4">
                <div className="p-6 rounded-full bg-surface border border-white/5">
                    <Shield size={32} className="opacity-50" />
                </div>
                <p className="font-medium">No items found</p>
            </div>
        ) : (
            filtered.map((recipe, idx) => (
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
                             {revealedPasswords[recipe.id] && (
                                <div className="absolute inset-0 bg-surfaceHighlight/95 backdrop-blur-md rounded-[2rem] z-10 flex items-center justify-between px-6 animate-fade-in">
                                    <span className="font-mono text-white text-sm tracking-wider select-all">{revealedPasswords[recipe.id]}</span>
                                    <button onClick={(e) => {e.stopPropagation(); handleReveal(e, recipe)}} className="p-2 bg-black/50 rounded-full text-zinc-400">
                                        <EyeOff size={16} />
                                    </button>
                                </div>
                             )}

                            <button
                                onClick={(e) => handleReveal(e, recipe)}
                                className="p-3 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                            >
                                {revealedPasswords[recipe.id] ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                            <button
                                onClick={(e) => handleCopy(e, recipe)}
                                className="p-3 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                            >
                                <Copy size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            ))
        )}
      </div>
    </div>
  );
};

export default Vault;
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Shield, RefreshCw, Terminal, Check } from './Icons';
import { generateDeterministicPassword } from '../services/cryptoUtils';
import { PasswordRecipe } from '../types';

interface GeneratorProps {
  masterKey: string;
  setMasterKey: (key: string) => void;
  onSaveToVault?: (recipe: PasswordRecipe) => void;
}

const Generator: React.FC<GeneratorProps> = ({ masterKey, setMasterKey, onSaveToVault }) => {
  const [showMaster, setShowMaster] = useState(false);
  const [service, setService] = useState('');
  const [username, setUsername] = useState('');
  const [length, setLength] = useState(16);
  const [generated, setGenerated] = useState('');
  const [displayPassword, setDisplayPassword] = useState(''); 
  const [copied, setCopied] = useState(false);
  const [counter, setCounter] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  // Config
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useNumber, setUseNumber] = useState(true);
  const [useSpecial, setUseSpecial] = useState(true);

  // Strength Vis
  const calculateStrength = (pass: string) => {
    let score = 0;
    if (!pass) return 0;
    if (pass.length > 8) score += 1;
    if (pass.length > 12) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return Math.min(score, 5);
  };
  const strength = calculateStrength(masterKey);

  useEffect(() => {
    if (!generated) {
        setDisplayPassword('');
        return;
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let iterations = 0;
    const interval = setInterval(() => {
        setDisplayPassword(prev => 
            generated.split("").map((_, i) => i < iterations ? generated[i] : chars[Math.floor(Math.random() * chars.length)]).join("")
        );
        if (iterations >= generated.length) clearInterval(interval);
        iterations += 1; 
    }, 30);
    return () => clearInterval(interval);
  }, [generated]);

  const requestGeneration = async () => {
    if (!masterKey || !service || !username) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 500)); // Visual delay
    try {
        const pwd = await generateDeterministicPassword(masterKey, service, username, length, counter, {
            useUpper, useLower, useNumber, useSpecial
        });
        setGenerated(pwd);
        if(navigator.vibrate) navigator.vibrate(20);
    } catch (e) { console.error(e); }
    setIsGenerating(false);
  };

  const handleCopy = () => {
    if (generated) {
      navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
      if(onSaveToVault) {
          onSaveToVault({
              id: crypto.randomUUID(), serviceName: service, username, length, counter,
              color: '#fff', useLowercase: useLower, useUppercase: useUpper, useNumbers: useNumber, useSpecial: useSpecial
          });
      }
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
                     <div className="flex gap-1">
                         {[1,2,3,4,5].map(i => (
                             <div key={i} className={`h-1.5 w-4 rounded-full transition-colors ${i <= strength ? 'bg-white' : 'bg-white/10'}`}></div>
                         ))}
                     </div>
                )}
            </div>
            <div className="relative">
                <input
                    type={showMaster ? "text" : "password"}
                    value={masterKey}
                    onChange={(e) => setMasterKey(e.target.value)}
                    placeholder="Enter key..."
                    className="w-full bg-black/30 border border-white/10 rounded-full px-6 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors font-mono tracking-wider"
                />
                <button 
                    onClick={() => setShowMaster(!showMaster)}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-white"
                >
                    {showMaster ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
             <div className="relative">
                 <input 
                    value={service}
                    onChange={e => setService(e.target.value)}
                    placeholder="Website (e.g. google.com)"
                    className="w-full bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-full px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all"
                 />
             </div>
             <div className="relative">
                 <input 
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username / Email"
                    className="w-full bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-full px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-all"
                 />
             </div>
        </div>

        {/* Options */}
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 space-y-6">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-300">Length: {length}</span>
                <input type="range" min="8" max="32" value={length} onChange={e => setLength(parseInt(e.target.value))} className="w-1/2" />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-300">Version: {counter}</span>
                <div className="flex gap-2">
                    <button onClick={() => setCounter(Math.max(1, counter-1))} className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center">-</button>
                    <button onClick={() => setCounter(counter+1)} className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center">+</button>
                </div>
            </div>
            <div className="flex justify-between gap-2">
                {[
                    { l: 'ABC', v: useUpper, s: setUseUpper },
                    { l: 'abc', v: useLower, s: setUseLower },
                    { l: '123', v: useNumber, s: setUseNumber },
                    { l: '#!?', v: useSpecial, s: setUseSpecial }
                ].map((opt, i) => (
                    <button 
                        key={i} 
                        onClick={() => opt.s(!opt.v)}
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
            disabled={!masterKey || !service || !username || isGenerating}
            className="w-full bg-white text-black font-bold py-5 rounded-full shadow-glow active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg tracking-wide"
        >
            {isGenerating ? 'Computing...' : 'Generate Password'}
        </button>

        {/* Result Area */}
        {generated && (
             <div className="animate-float mt-4 bg-surfaceHighlight border border-white/10 rounded-[2rem] p-8 text-center relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-50"></div>
                 <div className="font-mono text-2xl text-white mb-4 break-all">{displayPassword}</div>
                 <div className="flex justify-center gap-4">
                     <button onClick={handleCopy} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                        {copied ? <Check size={16}/> : <Copy size={16}/>} Copy
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
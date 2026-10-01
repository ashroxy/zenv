import React, { useEffect, useState } from 'react';
import { Shield, Lock } from './Icons';

interface IntroProps {
  onComplete: () => void;
}

const Intro: React.FC<IntroProps> = ({ onComplete }) => {
  const [displayText, setDisplayText] = useState('');
  const [opacity, setOpacity] = useState(1);
  const targetText = "ZENV";
  
  useEffect(() => {
    const chars = "XYZ010101#@!&$";
    let iteration = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    // Start delay
    const startTimeout = setTimeout(() => {
        interval = setInterval(() => {
            setDisplayText(
                targetText
                    .split("")
                    .map((_, index) => {
                        if (index < iteration) {
                            return targetText[index];
                        }
                        return chars[Math.floor(Math.random() * chars.length)];
                    })
                    .join("")
            );
            
            if (iteration >= targetText.length) { 
                if (interval !== null) clearInterval(interval);
                setTimeout(() => {
                    setOpacity(0);
                    setTimeout(onComplete, 800);
                }, 1000);
            }
            
            iteration += 1 / 4; 
        }, 50);
    }, 300);

    return () => {
        clearTimeout(startTimeout);
        if (interval !== null) clearInterval(interval);
    };
  }, [onComplete]);

  return (
    <div 
        onClick={onComplete}
        role="button"
        tabIndex={0}
        aria-label="Skip introduction"
        className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center transition-opacity duration-700 ease-out cursor-pointer select-none"
        style={{ opacity }}
    >
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-[60px] animate-pulse"></div>

        <div className="relative z-10 flex flex-col items-center">
            <div className="mb-8 relative">
                <div className="absolute inset-0 bg-white/20 blur-xl rounded-full"></div>
                <Shield size={64} className="text-white relative z-10 animate-float" strokeWidth={1.5} />
                <div className="absolute -bottom-2 -right-2 text-white bg-black rounded-full p-1 border border-white/10">
                    <Lock size={16} />
                </div>
            </div>

            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 tracking-[0.2em] font-mono mb-2">
                {displayText || "...."}
            </h1>
            
            <div className="h-0.5 w-32 bg-white/10 rounded-full overflow-hidden mt-6">
                <div className="h-full bg-white animate-[loading_2s_ease-in-out_forwards] w-full origin-left scale-x-0"></div>
            </div>
            
            <p className="mt-4 text-xs text-zinc-600 font-mono tracking-widest uppercase">
                Initializing Secure Environment
            </p>
        </div>
    </div>
  );
};

export default Intro;

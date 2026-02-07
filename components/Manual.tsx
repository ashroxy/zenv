import React from 'react';
import { Shield, Terminal, Lock } from './Icons';

const Manual: React.FC = () => {
  return (
    <div className="h-full px-6 pt-8 pb-32 font-sans overflow-y-auto text-zinc-400">
      <h1 className="text-3xl font-bold text-white mb-8">Manual</h1>

      <div className="space-y-8">
          <section>
              <h2 className="text-white font-semibold text-lg mb-2 flex items-center gap-2">
                  <Shield size={18} /> Zero Knowledge
              </h2>
              <p className="text-sm leading-relaxed">
                  Zenv never stores your passwords. It stores "Recipes" (Site + Username). Your password is mathematically derived from these recipes + your Master Key in real-time.
              </p>
          </section>

          <section>
              <h2 className="text-white font-semibold text-lg mb-2 flex items-center gap-2">
                  <Lock size={18} /> Master Key
              </h2>
              <p className="text-sm leading-relaxed">
                  This key is the seed for all your passwords. It is not saved anywhere. If you close the tab or refresh, you must re-enter it. If you forget it, your passwords are gone forever.
              </p>
          </section>

          <section>
              <h2 className="text-white font-semibold text-lg mb-2 flex items-center gap-2">
                  <Terminal size={18} /> Recovery
              </h2>
              <p className="text-sm leading-relaxed">
                  Use the <strong>Settings</strong> tab to export a backup file (`.cvx`). This file contains your recipes, encrypted with a separate password. Transfer this file to a safe location.
              </p>
          </section>

          <div className="p-6 rounded-[2rem] bg-surface border border-white/5 mt-8">
              <h3 className="text-white font-bold mb-2">Quick Start</h3>
              <ol className="list-decimal list-inside text-sm space-y-2">
                  <li>Go to <strong>Generator</strong>.</li>
                  <li>Set a <strong>Master Key</strong> (Memorize this!).</li>
                  <li>Enter a Website and Username.</li>
                  <li>Click <strong>Generate</strong> & Save.</li>
                  <li>Find it later in your <strong>Vault</strong>.</li>
              </ol>
          </div>
      </div>
    </div>
  );
};

export default Manual;
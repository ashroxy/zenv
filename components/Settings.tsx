// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025 ashroxy
import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, Trash2, Lock, ArrowRight, Check, AlertTriangle, User, FileText } from './Icons';
import type { PasswordRecipe, UserProfile } from '../types';
import { exportData, buildBackupFileName } from '../services/storageService';
import { encryptExport, decryptImport } from '../services/cryptoUtils';
import { parseBackupDocument } from '../services/schema';
import { MAX_BACKUP_BYTES } from '../services/limits';

// Native save targets. Capacitor requires `recursive: true` when a parent
// directory may not exist yet; Directory.Documents is app-scoped on Android.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface SettingsProps {
  recipes: PasswordRecipe[];
  /** `rejected` counts entries that failed schema validation and were skipped. */
  onImport: (data: PasswordRecipe[], rejected: number) => void;
  onWipe: () => void | Promise<void>;
  onLock: () => void;
  onSwitchUser: () => void;
  currentUser: UserProfile;
}

const SettingsPage: React.FC<SettingsProps> = ({ recipes, onImport, onWipe, onLock, onSwitchUser, currentUser }) => {
  const [passphrase, setPassphrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);

  const timers = useRef<Set<number>>(new Set());
  useEffect(() => () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  }, []);

  const report = (msg: string, isError = false): void => {
    setStatus(msg);
    setStatusIsError(isError);
  };
  
  // Export State
  const [isPreparing, setIsPreparing] = useState(false);
  const [encryptedBackup, setEncryptedBackup] = useState<string | null>(null);
  const [backupFileName, setBackupFileName] = useState<string>('');
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Legal & Licenses modal state
  const [showLegalModal, setShowLegalModal] = useState(false);

  // Step 1: Encrypt the data
  const handlePrepareBackup = async () => {
    if (!passphrase) return report('Encryption Password Required', true);
    setIsPreparing(true);
    setEncryptedBackup(null);

    try {
        // No artificial delay: PBKDF2 at 310k iterations dominates and the
        // button already shows a spinner.
        const raw = exportData(recipes);
        const encrypted = await encryptExport(raw, passphrase);

        // The profile name reaches a native filesystem API as a path segment.
        // Sanitise it here rather than interpolating it raw.
        setEncryptedBackup(encrypted);
        setBackupFileName(buildBackupFileName(currentUser.name));
        report('Backup Encrypted & Ready');
    } catch (e) {
        console.error(e);
        report(e instanceof Error ? e.message : 'Encryption Failed', true);
    } finally {
        setIsPreparing(false);
    }
  };

  const handleSave = async () => {
      if (!encryptedBackup || !backupFileName) {
          report('Error: No backup data found.', true);
          return;
      }

      report('Saving...');

      try {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await Filesystem.writeFile({
                    path: backupFileName,
                    data: encryptedBackup,
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8,
                    recursive: true
                });
                report('Saved to Documents: ' + result.uri);
            } catch {
                // Directory.Documents can be unavailable on some Android
                // configurations; fall back to shared external storage.
                try {
                    await Filesystem.writeFile({
                        path: backupFileName,
                        data: encryptedBackup,
                        directory: Directory.External,
                        encoding: Encoding.UTF8,
                        recursive: true
                    });
                    report('Saved to Device Storage!');
                } catch (extError) {
                    report(
                        'External Storage failed: ' +
                        (extError instanceof Error ? extError.message : 'unknown error'),
                        true,
                    );
                }
            }
        } else {
            const blob = new Blob([encryptedBackup], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = backupFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            report('File Downloaded!');
        }

        resetExport();
      } catch (e) {
          console.error(e);
          report('Save Failed: ' + (e instanceof Error ? e.message : 'unknown error'), true);
      }
  };

  const resetExport = () => {
      const id = window.setTimeout(() => {
          timers.current.delete(id);
          setEncryptedBackup(null);
          setPassphrase('');
          setBackupFileName('');
      }, 3000);
      timers.current.add(id);
  };

const handleImport = () => {
      if (!selectedFile) return report('Please select a .cvx file', true);
      if (!passphrase) return report('Decryption Password Required', true);

      // Guard the size before allocating: a large file here is a memory
      // exhaustion vector on a mobile device, and this file is decrypted
      // with AES-GCM which is not streamable.
      if (selectedFile.size > MAX_BACKUP_BYTES) {
        return report(
          `File is too large (${Math.round(selectedFile.size / 1024 / 1024)} MB). ` +
          `Limit is ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB.`,
          true,
        );
      }

      setIsImporting(true);
      const reader = new FileReader();

      reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const decrypted = await decryptImport(content, passphrase);

            // Schema-validate instead of trusting the shape. The old code
            // checked `Array.isArray(parsed.data)` only, so a hand-edited file
            // could inject arbitrary objects into the vault.
            const { recipes: imported, rejected } = parseBackupDocument(JSON.parse(decrypted));

            onImport(imported, rejected);
            report(
              `Restored ${imported.length} ${imported.length === 1 ? 'item' : 'items'}` +
              (rejected > 0 ? `, skipped ${rejected} invalid.` : '.'),
              rejected > 0,
            );
            setPassphrase('');
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          } catch (err) {
            console.error(err);
            // Surface the specific reason: a malformed file and a wrong
            // passphrase need different user actions.
            report(err instanceof Error ? err.message : 'Restore Failed.', true);
          } finally {
            setIsImporting(false);
          }
      };

      reader.onerror = () => {
          report('Error reading file', true);
          setIsImporting(false);
      };

      reader.readAsText(selectedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setSelectedFile(e.target.files[0]);
          report('');
      }
  };

  return (
    <div className="h-full px-6 pt-8 pb-40 font-sans overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">System</h1>
        <div className="px-3 py-1 rounded-full bg-white/10 text-xs font-mono text-zinc-400 border border-white/5">
            {currentUser.name}
        </div>
      </div>

      {status && (
          <div className={`mb-6 p-4 rounded-2xl font-medium text-center animate-fade-in flex items-center justify-between ${statusIsError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white text-black'}`}>
              <span className="text-sm">{status}</span>
              <button onClick={() => setStatus(null)} className="ml-4 opacity-50 text-xl leading-none" aria-label="Dismiss">&times;</button>
          </div>
      )}

      <div className="space-y-4">
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-surfaceHighlight transition-colors" onClick={onSwitchUser}>
            <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-full text-white"><User size={20} /></div>
                <div>
                    <h3 className="font-semibold text-white">Switch Profile</h3>
                    <p className="text-zinc-500 text-xs">Log out and change user</p>
                </div>
            </div>
            <ArrowRight size={16} className="text-zinc-600" />
        </div>

        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-surfaceHighlight transition-colors" onClick={() => { onLock(); report('Memory Flushed'); }}>
            <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-full text-white"><Lock size={20} /></div>
                <div>
                    <h3 className="font-semibold text-white">Flush Memory</h3>
                    <p className="text-zinc-500 text-xs">Lock vault immediately</p>
                </div>
            </div>
            <ArrowRight size={16} className="text-zinc-600" />
        </div>

        {/* Export / Backup Section */}
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 space-y-4">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-white/5 rounded-full text-white"><Download size={20} /></div>
                <div>
                    <h3 className="font-semibold text-white">Backup Data</h3>
                    <p className="text-zinc-500 text-xs">Export encrypted .cvx file</p>
                </div>
            </div>

            {!encryptedBackup ? (
                <div className="bg-black/30 rounded-2xl p-1 flex items-center border border-white/5 focus-within:border-white/20 transition-colors">
                    <input 
                        type="password" 
                        value={passphrase} 
                        onChange={e => setPassphrase(e.target.value)} 
                        placeholder="Set Encryption Password" 
                        className="bg-transparent flex-1 px-4 py-3 text-sm text-white focus:outline-none placeholder-zinc-600"
                    />
                    <button 
                        onClick={() => void handlePrepareBackup()} 
                        disabled={isPreparing}
                        className="p-3 bg-white rounded-xl text-black m-1 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                        {isPreparing ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <ArrowRight size={16} />}
                    </button>
                </div>
            ) : (
                <div className="animate-fade-in space-y-3">
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-xs text-center font-mono break-all">
                        Ready: {backupFileName}
                    </div>
                    
                    <button 
                        onClick={() => void handleSave()} 
                        className="w-full py-4 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors shadow-glow"
                    >
                        <Download size={20} />
                        <span>Save Backup File</span>
                    </button>
                    
                    <button onClick={() => setEncryptedBackup(null)} className="w-full py-2 text-xs text-zinc-500 hover:text-white transition-colors">
                        Cancel
                    </button>
                </div>
            )}
        </div>

        {/* Import */}
        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 space-y-4">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-white/5 rounded-full text-white"><Upload size={20} /></div>
                <div>
                    <h3 className="font-semibold text-white">Restore Data</h3>
                    <p className="text-zinc-500 text-xs">Import from backup</p>
                </div>
            </div>
            
            <div className="relative group">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect}
                    accept=".cvx,application/json,text/plain,*/*"
                    onClick={(e) => (e.currentTarget.value = '')} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-3 ${selectedFile ? 'text-white' : 'text-zinc-500'}`}>
                    <div className="p-2 bg-white/5 rounded-lg">
                        {selectedFile ? <Check size={14} className="text-green-400"/> : <Upload size={14} />}
                    </div>
                    <span className="text-xs truncate font-mono">
                        {selectedFile ? selectedFile.name : 'Tap to select backup file...'}
                    </span>
                </div>
            </div>

            {selectedFile && (
                <div className="bg-black/30 rounded-2xl p-1 flex items-center border border-white/5 focus-within:border-white/20 transition-colors animate-fade-in">
                    <input 
                        type="password" 
                        value={passphrase} 
                        onChange={e => setPassphrase(e.target.value)} 
                        placeholder="Enter Decryption Password" 
                        className="bg-transparent flex-1 px-4 py-3 text-sm text-white focus:outline-none placeholder-zinc-600"
                    />
                    <button 
                        onClick={() => void handleImport()} 
                        disabled={isImporting}
                        className="p-3 bg-white rounded-xl text-black m-1 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                        {isImporting ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <Check size={16} />}
                    </button>
                </div>
            )}
        </div>

        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-surfaceHighlight transition-colors" onClick={() => setShowLegalModal(true)}>
            <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-full text-white"><FileText size={20} /></div>
                <div>
                    <h3 className="font-semibold text-white">Legal & Open Source</h3>
                    <p className="text-zinc-500 text-xs">Attributions, font licenses & offline guarantee</p>
                </div>
            </div>
            <ArrowRight size={16} className="text-zinc-600" />
        </div>

        <div className="bg-red-500/5 rounded-[2rem] p-6 border border-red-500/10 flex items-center justify-between cursor-pointer hover:bg-red-500/10 transition-colors active:scale-[0.98]" onClick={() => { if(!showDeleteConfirm) setShowDeleteConfirm(true); }}>
            <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Trash2 size={20} /></div>
                <div>
                    <h3 className="font-semibold text-red-500">Profile Reset</h3>
                    <p className="text-red-500/50 text-xs">Delete data for {currentUser.name}</p>
                </div>
            </div>
            <AlertTriangle size={16} className="text-red-500/50" />
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
            <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-8 animate-fade-in">
                <div className="bg-surface border border-red-500/30 rounded-[2rem] p-6 w-full max-w-sm">
                    <h3 className="text-xl font-bold text-red-500 mb-4 text-center">Delete All Data?</h3>
                    <p className="text-secondary text-sm mb-6 text-center">This will permanently delete all passwords for {currentUser.name}. This cannot be undone.</p>
                    <div className="flex gap-3">
                        <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors">
                            Cancel
                        </button>
                        <button onClick={() => { setShowDeleteConfirm(false); void Promise.resolve(onWipe()); }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-500 transition-colors">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Legal & Open Source Licenses Modal */}
        {showLegalModal && (
            <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-6 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="legal-title">
                <div className="bg-surface border border-white/10 rounded-[2rem] p-6 w-full max-w-md max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
                        <div>
                            <h3 id="legal-title" className="text-lg font-bold text-white">Legal & Attribution</h3>
                            <p className="text-zinc-500 text-xs">100% Offline & Open Source</p>
                        </div>
                        <button 
                            onClick={() => setShowLegalModal(false)}
                            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                            aria-label="Close legal modal"
                        >
                            &times;
                        </button>
                    </div>

                    <div className="overflow-y-auto space-y-4 pr-1 text-xs text-zinc-300 leading-relaxed">
                        <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-1">
                            <h4 className="font-semibold text-white text-sm">ZenV Core</h4>
                            <p className="text-zinc-400">Copyright &copy; 2025 ashroxy. Licensed under the MIT License.</p>
                        </div>

                        <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-1">
                            <h4 className="font-semibold text-white text-sm">Vendored Typography</h4>
                            <p className="font-medium text-zinc-200">Inter</p>
                            <p className="text-zinc-400">Copyright &copy; 2016 The Inter Project Authors. SIL Open Font License 1.1.</p>
                            <p className="font-medium text-zinc-200 pt-2">JetBrains Mono</p>
                            <p className="text-zinc-400">Copyright &copy; 2020 The JetBrains Mono Project Authors. SIL Open Font License 1.1.</p>
                        </div>

                        <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-1">
                            <h4 className="font-semibold text-white text-sm">Icons & Runtime</h4>
                            <p className="text-zinc-400"><strong>Lucide Icons:</strong> ISC License (Lucide Authors)</p>
                            <p className="text-zinc-400"><strong>React / React DOM:</strong> BSD-3-Clause (Meta Platforms, Inc.)</p>
                            <p className="text-zinc-400"><strong>Capacitor:</strong> MIT License (Ionic)</p>
                        </div>

                        <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-1">
                            <h4 className="font-semibold text-white text-sm">Privacy & Zero Network Claim</h4>
                            <p className="text-zinc-400">
                                ZenV does not connect to any servers, cloud services, or external APIs. No telemetry or analytics are collected.
                                Release builds omit the Android INTERNET permission to guarantee offline operation at the OS level.
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 mt-4">
                        <button 
                            onClick={() => setShowLegalModal(false)}
                            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

// âœ… EXPORT WITH THE NEW NAME
export default SettingsPage;

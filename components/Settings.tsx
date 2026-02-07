import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, Lock, ArrowRight, Check, AlertTriangle, User, Settings as SettingsIcon } from './Icons'; // ✅ Fixed Import
import { PasswordRecipe, UserProfile } from '../types';
import { exportData } from '../services/storageService';
import { encryptExport, decryptImport } from '../services/cryptoUtils';

// ✅ NEW IMPORTS FOR ANDROID SAVING
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface SettingsProps {
  recipes: PasswordRecipe[];
  onImport: (data: PasswordRecipe[]) => void;
  onWipe: () => void;
  onLock: () => void;
  onSwitchUser: () => void;
  currentUser: UserProfile;
}

// ✅ RENAMED COMPONENT TO "SettingsPage" TO PREVENT ERRORS
const SettingsPage: React.FC<SettingsProps> = ({ recipes, onImport, onWipe, onLock, onSwitchUser, currentUser }) => {
  const [passphrase, setPassphrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  
  // Export State
  const [isPreparing, setIsPreparing] = useState(false);
  const [encryptedBackup, setEncryptedBackup] = useState<string | null>(null);
  const [backupFileName, setBackupFileName] = useState<string>('');
  
  // Import State
  const [isImporting, setIsImporting] = useState(false);

  // Step 1: Encrypt the data
  const handlePrepareBackup = async () => {
    if (!passphrase) return setStatus('Encryption Password Required');
    setIsPreparing(true);
    setEncryptedBackup(null);
    
    try {
        await new Promise(r => setTimeout(r, 100));
        
        const raw = exportData(recipes);
        const encrypted = await encryptExport(raw, passphrase);
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Zenv_${currentUser.name}_${dateStr}.cvx`;
        
        setEncryptedBackup(encrypted);
        setBackupFileName(fileName);
        setStatus('Backup Encrypted & Ready');
    } catch (e) {
        console.error(e);
        setStatus('Encryption Failed');
    } finally {
        setIsPreparing(false);
    }
  };

  // ✅ DEBUG VERSION of handleSave
  const handleSave = async () => {
      alert("Starting Save Process..."); 

      if (!encryptedBackup || !backupFileName) {
          alert("Error: No backup data found.");
          return;
      }

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
                alert("SUCCESS! File saved at: " + result.uri);
                setStatus('File Saved to "Documents" folder!');
            } catch (docError: any) {
                alert("Documents failed: " + JSON.stringify(docError));
                
                // Fallback: Try External Storage
                try {
                    alert("Trying External Storage...");
                    await Filesystem.writeFile({
                        path: backupFileName,
                        data: encryptedBackup,
                        directory: Directory.External,
                        encoding: Encoding.UTF8,
                        recursive: true
                    });
                    alert("SUCCESS! Saved to External Storage.");
                    setStatus('File Saved to Device Storage!');
                } catch (extError: any) {
                     alert("External Storage also failed: " + JSON.stringify(extError));
                }
            }
        } else {
            // Web Browser Fallback
            const blob = new Blob([encryptedBackup], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = backupFileName; 
            document.body.appendChild(a); 
            a.click(); 
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert("File Downloaded (Web Mode)");
        }

        resetExport();
      } catch (e: any) {
          alert("CRITICAL ERROR: " + JSON.stringify(e));
          console.error(e);
          setStatus('Save Failed: ' + (e.message || e));
      }
  };

  const resetExport = () => {
      setTimeout(() => {
          setEncryptedBackup(null);
          setPassphrase('');
          setBackupFileName('');
      }, 3000);
  };

  const handleImport = async () => {
      if(!selectedFile) return setStatus('Please select a .cvx file');
      if(!passphrase) return setStatus('Decryption Password Required');
      
      setIsImporting(true);
      const reader = new FileReader();
      
      reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const decrypted = await decryptImport(content, passphrase);
            const parsed = JSON.parse(decrypted);
            
            if (!parsed.data || !Array.isArray(parsed.data)) {
                throw new Error("Invalid file structure");
            }

            onImport(parsed.data);
            setStatus(`Success! Restored ${parsed.data.length} items.`);
            setPassphrase('');
            setSelectedFile(null);
            if(fileInputRef.current) fileInputRef.current.value = '';
          } catch (err) { 
            console.error(err);
            setStatus('Restore Failed: Incorrect password or corrupt file.'); 
          } finally {
            setIsImporting(false);
          }
      };
      
      reader.onerror = () => {
          setStatus('Error reading file');
          setIsImporting(false);
      };
      
      reader.readAsText(selectedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setSelectedFile(e.target.files[0]);
          setStatus(null);
      }
  };

  return (
    <div className="h-full px-6 pt-8 pb-32 font-sans overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">System</h1>
        <div className="px-3 py-1 rounded-full bg-white/10 text-xs font-mono text-zinc-400 border border-white/5">
            {currentUser.name}
        </div>
      </div>

      {status && (
          <div className={`mb-6 p-4 rounded-2xl font-medium text-center animate-fade-in flex items-center justify-between ${status.includes('Failed') || status.includes('Required') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white text-black'}`}>
              <span className="text-sm">{status}</span>
              <button onClick={() => setStatus(null)} className="ml-4 opacity-50 text-xl leading-none">&times;</button>
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

        <div className="bg-surface rounded-[2rem] p-6 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-surfaceHighlight transition-colors" onClick={() => { onLock(); setStatus('Memory Flushed'); }}>
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
                        onClick={handlePrepareBackup} 
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
                        onClick={handleSave} 
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
                        onClick={handleImport} 
                        disabled={isImporting}
                        className="p-3 bg-white rounded-xl text-black m-1 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                        {isImporting ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <Check size={16} />}
                    </button>
                </div>
            )}
        </div>

        <div className="bg-red-500/5 rounded-[2rem] p-6 border border-red-500/10 flex items-center justify-between cursor-pointer hover:bg-red-500/10 transition-colors active:scale-[0.98]" onClick={() => { if(window.confirm('WARNING: This will permanently delete local data for this profile. Are you sure?')) onWipe(); }}>
            <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Trash2 size={20} /></div>
                <div>
                    <h3 className="font-semibold text-red-500">Profile Reset</h3>
                    <p className="text-red-500/50 text-xs">Delete data for {currentUser.name}</p>
                </div>
            </div>
            <AlertTriangle size={16} className="text-red-500/50" />
        </div>

      </div>
    </div>
  );
};

// ✅ EXPORT WITH THE NEW NAME
export default SettingsPage;
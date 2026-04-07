import React, { useState, useEffect, useRef } from 'react';
import { PasswordRecipe, TabView, UserProfile } from './types';
import { getStoredRecipes, saveRecipes, getUsers, addUser, deleteUser } from './services/storageService';
import Vault from './components/Vault';
import Generator from './components/Generator';
import SettingsPage from './components/Settings'; // ✅ UPDATED IMPORT NAME
import Manual from './components/Manual';
import EditAccountModal from './components/EditAccountModal';
import Intro from './components/Intro';
import UserSelect from './components/UserSelect';
import { Shield, Key, Settings as SettingsIcon, BookOpen, EyeOff } from './components/Icons';

const AUTO_LOCK_TIME = 2 * 60 * 1000;

const App: React.FC = () => {
  const [showIntro, setShowIntro] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  
  const [activeTab, setActiveTab] = useState<TabView>('vault');
  const [recipes, setRecipes] = useState<PasswordRecipe[]>([]);
  const [masterKey, setMasterKey] = useState(''); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PasswordRecipe | null>(null);
  const [isPrivacyActive, setIsPrivacyActive] = useState(false);
  
  const lastActive = useRef<number>(Date.now());
  const idleTimer = useRef<number | null>(null);

  // Initialize Users
  useEffect(() => {
    const storedUsers = getUsers();
    setAllUsers(storedUsers);
  }, []);

  // Load Recipes when User Changes
  useEffect(() => {
    if (currentUser) {
      setRecipes(getStoredRecipes(currentUser.id));
      setMasterKey(''); // Reset master key on user switch
      setActiveTab('vault');
    } else {
      setRecipes([]);
    }
  }, [currentUser]);

  // Save Recipes whenever they change (if user is logged in)
  useEffect(() => {
    if (currentUser) {
      saveRecipes(currentUser.id, recipes);
    }
  }, [recipes, currentUser]);

  // User Management Handlers
  const handleCreateUser = (name: string) => {
    const newUser = addUser(name);
    setAllUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser); // Auto login
  };

  const handleDeleteUser = (id: string) => {
    deleteUser(id);
    setAllUsers(prev => prev.filter(u => u.id !== id));
    if (currentUser?.id === id) {
      setCurrentUser(null);
    }
  };

  const handleSwitchUser = () => {
      setMasterKey('');
      setCurrentUser(null);
      setActiveTab('vault');
  };

  // Security & Visibility Logic
  useEffect(() => {
    const handleActivity = () => {
        lastActive.current = Date.now();
        if (document.visibilityState === 'visible' && !showIntro) {
            setIsPrivacyActive(false);
        }
    };

    const checkIdle = () => {
        if (masterKey && (Date.now() - lastActive.current > AUTO_LOCK_TIME)) {
            setMasterKey(''); 
            if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    idleTimer.current = window.setInterval(checkIdle, 10000); 

    const handleVisibilityChange = () => {
        if (document.hidden) {
            setIsPrivacyActive(true);
        } else {
            setShowIntro(true);
            setIsPrivacyActive(false);
            handleActivity();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', () => {
        if (document.visibilityState === 'visible') handleActivity();
    });
    window.addEventListener('blur', () => setIsPrivacyActive(true));

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('blur', () => setIsPrivacyActive(true));
      window.removeEventListener('focus', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (idleTimer.current) clearInterval(idleTimer.current);
    };
  }, [masterKey]);

  const handleAddAccount = (recipe: PasswordRecipe) => {
    if (editingRecipe) {
      setRecipes(prev => prev.map(r => r.id === recipe.id ? recipe : r));
    } else {
      setRecipes(prev => [...prev, recipe]);
    }
  };

  const handleSaveFromGenerator = (recipe: PasswordRecipe) => {
    setRecipes(prev => [...prev, recipe]);
    setActiveTab('vault');
  };

  const handleDeleteAccount = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const handleWipe = () => {
    setRecipes([]);
    setMasterKey('');
    // Note: This only wipes the current user's recipes array in memory.
    // The effect hook [recipes] will then save empty array to storage.
  };

  return (
    <div className="h-full w-full flex flex-col bg-background text-primary overflow-hidden relative selection:bg-white/20 pt-safe">
      
      {/* Intro */}
      {showIntro && <Intro onComplete={() => setShowIntro(false)} />}

      {/* Background Spotlight */}
      <div className="absolute inset-0 bg-spotlight pointer-events-none z-0"></div>

      {/* Privacy Overlay */}
      {isPrivacyActive && !showIntro && (
          <div 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-8 animate-fade-in cursor-pointer"
            onClick={() => {
                setIsPrivacyActive(false);
                lastActive.current = Date.now();
            }}
          >
              <div className="p-8 bg-surface rounded-full border border-white/10 shadow-glow mb-6 animate-pulse">
                  <EyeOff size={48} className="text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Locked</h2>
              <p className="text-secondary text-sm">Tap to resume session</p>
          </div>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 overflow-hidden relative z-10 transition-opacity duration-500 ${isPrivacyActive ? 'opacity-0' : 'opacity-100'}`}>
        {!currentUser && !showIntro ? (
            <UserSelect 
                users={allUsers} 
                onSelect={setCurrentUser} 
                onCreate={handleCreateUser}
                onDelete={handleDeleteUser}
            />
        ) : currentUser ? (
            <>
                {activeTab === 'vault' && (
                <Vault 
                    recipes={recipes} 
                    onAdd={() => { setEditingRecipe(null); setIsModalOpen(true); }}
                    onEdit={(r) => { setEditingRecipe(r); setIsModalOpen(true); }}
                    onDelete={handleDeleteAccount}
                    masterKey={masterKey}
                    userProfile={currentUser}
                />
                )}
                {activeTab === 'generator' && (
                <Generator 
                    masterKey={masterKey} 
                    setMasterKey={setMasterKey} 
                    onSaveToVault={handleSaveFromGenerator}
                />
                )}
                {activeTab === 'manual' && <Manual />}
                {activeTab === 'settings' && (
                // ✅ UPDATED COMPONENT TAG
                <SettingsPage 
                    recipes={recipes} 
                    onImport={(data) => setRecipes(data)} 
                    onWipe={handleWipe} 
                    onLock={() => setMasterKey('')}
                    onSwitchUser={handleSwitchUser}
                    currentUser={currentUser}
                />
                )}
            </>
        ) : null}
      </main>

      {/* Navigation - Only show if logged in */}
      {currentUser && !showIntro && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-all duration-500 ${isPrivacyActive ? 'translate-y-full' : 'translate-y-0'}`}>
            <nav className="mx-auto max-w-md bg-surface/80 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl flex justify-between items-center px-6 py-4">
                {[
                    { id: 'vault', icon: Shield, label: 'Vault' },
                    { id: 'generator', icon: Key, label: 'Gen' },
                    { id: 'manual', icon: BookOpen, label: 'Guide' },
                    { id: 'settings', icon: SettingsIcon, label: 'Settings' },
                ].map((item) => (
                    <button 
                    key={item.id}
                    onClick={() => setActiveTab(item.id as TabView)}
                    className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                        activeTab === item.id 
                        ? 'text-white scale-110' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    >
                    <item.icon size={24} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                    <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
      )}

      {/* Edit Modal */}
      {currentUser && (
          <EditAccountModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSave={handleAddAccount}
            initialData={editingRecipe}
            existingRecipes={recipes}
          />
      )}
    </div>
  );
};

export default App;
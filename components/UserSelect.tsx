import React, { useState } from 'react';
import type { UserProfile } from '../types';
import { Plus, User, Trash2, ArrowRight, AlertTriangle } from './Icons';

interface UserSelectProps {
  users: UserProfile[];
  onSelect: (user: UserProfile) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

const UserSelect: React.FC<UserSelectProps> = ({ users, onSelect, onCreate, onDelete }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{show: boolean; user: UserProfile | null}>({show: false, user: null});

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('Profile name cannot be empty.');
      return;
    }
    try {
      onCreate(trimmed);
      setNewName('');
      setIsCreating(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create profile.');
    }
  };

  const getAvatarGradient = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h = Math.abs(hash % 360);
    return `linear-gradient(135deg, hsl(${h}, 70%, 20%), hsl(${h + 40}, 70%, 10%))`;
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 animate-fade-in relative z-20">
      
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Who is this?</h1>
        <p className="text-zinc-500 text-sm">Select a secure profile to continue</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {users.map(user => (
          <div 
            key={user.id}
            onClick={() => onSelect(user)}
            className="group relative bg-surface hover:bg-surfaceHighlight border border-white/5 rounded-[2rem] p-4 transition-all active:scale-[0.98] cursor-pointer flex items-center gap-4 overflow-hidden"
          >
            {/* Avatar */}
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center text-white border border-white/10 shadow-lg"
              style={{ background: getAvatarGradient(user.name) }}
            >
              <User size={20} />
            </div>

            {/* Info */}
            <div className="flex-1">
              <h3 className="text-white font-medium text-lg">{user.name}</h3>
              <p className="text-zinc-500 text-xs">Profile</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <ArrowRight size={20} className="text-zinc-600 group-hover:text-white transition-colors" />
                {users.length > 1 && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm({show: true, user}); }}
                        className="p-2 text-zinc-700 hover:text-red-500 transition-colors z-10"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
          </div>
        ))}

        {/* Create New Profile */}
        {isCreating ? (
          <div className="space-y-2 animate-slide-up">
            <form onSubmit={handleCreate} className="bg-surface border border-white/20 rounded-[2rem] p-2 flex items-center">
              <input 
                autoFocus
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setCreateError(null); }}
                placeholder="Profile Name (e.g. Office)"
                aria-label="New profile name"
                className="flex-1 bg-transparent px-4 py-3 text-white placeholder-zinc-500 focus:outline-none text-sm"
              />
              <button 
                type="button"
                onClick={() => { setIsCreating(false); setNewName(''); setCreateError(null); }}
                className="p-3 text-zinc-500 hover:text-white text-xs"
                aria-label="Cancel creating profile"
              >
                Cancel
              </button>
              <button 
                type="submit"
                aria-label="Save profile"
                className="bg-white text-black p-3 rounded-full hover:scale-105 transition-transform"
              >
                <ArrowRight size={20} />
              </button>
            </form>
            {createError && (
              <p role="alert" className="flex items-center gap-1.5 text-xs text-red-400 px-4">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{createError}</span>
              </p>
            )}
          </div>
        ) : (
          <button 
            onClick={() => { setIsCreating(true); setCreateError(null); }}
            className="w-full py-4 rounded-[2rem] border border-dashed border-white/20 text-zinc-500 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            <span>Add Profile</span>
          </button>
        )}
      </div>

      {deleteConfirm.show && deleteConfirm.user && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="bg-surface border border-red-500/30 rounded-[2rem] p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold text-red-500 mb-4 text-center">Delete Profile?</h3>
            <p className="text-secondary text-sm mb-6 text-center">This will permanently delete "{deleteConfirm.user.name}" and all its passwords.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm({show: false, user: null})} className="flex-1 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors">
                Cancel
              </button>
              <button onClick={() => { onDelete(deleteConfirm.user!.id); setDeleteConfirm({show: false, user: null}); }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-500 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSelect;

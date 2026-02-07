import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Plus, User, Trash2, ArrowRight } from './Icons';

interface UserSelectProps {
  users: UserProfile[];
  onSelect: (user: UserProfile) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

const UserSelect: React.FC<UserSelectProps> = ({ users, onSelect, onCreate, onDelete }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreate(newName);
      setNewName('');
      setIsCreating(false);
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
                        onClick={(e) => { e.stopPropagation(); if(confirm(`Delete profile "${user.name}" and all its passwords?`)) onDelete(user.id); }}
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
          <form onSubmit={handleCreate} className="bg-surface border border-white/20 rounded-[2rem] p-2 flex items-center animate-slide-up">
            <input 
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Profile Name (e.g. Office)"
              className="flex-1 bg-transparent px-4 py-3 text-white placeholder-zinc-500 focus:outline-none"
            />
            <button 
              type="submit"
              className="bg-white text-black p-3 rounded-full hover:scale-105 transition-transform"
            >
              <ArrowRight size={20} />
            </button>
          </form>
        ) : (
          <button 
            onClick={() => setIsCreating(true)}
            className="w-full py-4 rounded-[2rem] border border-dashed border-white/20 text-zinc-500 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            <span>Add Profile</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default UserSelect;

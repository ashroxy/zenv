import { PasswordRecipe, UserProfile } from '../types';

const USERS_KEY = 'zenv_users';
const RECIPES_PREFIX = 'zenv_recipes_';
const OLD_STORAGE_KEY = 'ciphervault_recipes'; // Legacy key

// --- User Management ---

export const getUsers = (): UserProfile[] => {
  const usersJson = localStorage.getItem(USERS_KEY);
  
  // Migration Logic: If no users exist but legacy data does
  if (!usersJson && localStorage.getItem(OLD_STORAGE_KEY)) {
    const legacyData = localStorage.getItem(OLD_STORAGE_KEY);
    const defaultUser: UserProfile = { 
      id: crypto.randomUUID(), 
      name: 'Personal', 
      created: Date.now() 
    };
    
    // Migrate data
    localStorage.setItem(USERS_KEY, JSON.stringify([defaultUser]));
    localStorage.setItem(`${RECIPES_PREFIX}${defaultUser.id}`, legacyData || '[]');
    localStorage.removeItem(OLD_STORAGE_KEY); // Cleanup old key
    
    return [defaultUser];
  }

  return usersJson ? JSON.parse(usersJson) : [];
};

export const addUser = (name: string): UserProfile => {
  const users = getUsers();
  const newUser: UserProfile = {
    id: crypto.randomUUID(),
    name: name.trim() || 'New Profile',
    created: Date.now()
  };
  users.push(newUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  // Initialize empty recipes for new user
  localStorage.setItem(`${RECIPES_PREFIX}${newUser.id}`, '[]');
  return newUser;
};

export const deleteUser = (userId: string) => {
  const users = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.removeItem(`${RECIPES_PREFIX}${userId}`);
};

// --- Recipe Management (Scoped to User) ---

export const getStoredRecipes = (userId: string): PasswordRecipe[] => {
  if (!userId) return [];
  const data = localStorage.getItem(`${RECIPES_PREFIX}${userId}`);
  return data ? JSON.parse(data) : [];
};

export const saveRecipes = (userId: string, recipes: PasswordRecipe[]) => {
  if (!userId) return;
  localStorage.setItem(`${RECIPES_PREFIX}${userId}`, JSON.stringify(recipes));
};

export const exportData = (recipes: PasswordRecipe[]) => {
  const json = JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    data: recipes
  });
  return json;
};
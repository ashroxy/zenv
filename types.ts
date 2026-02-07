export interface PasswordRecipe {
  id: string;
  serviceName: string; // The Domain/Website
  username: string;
  length: number;
  counter: number; // For password rotation (e.g. version 1, 2, 3)
  useUppercase: boolean;
  useLowercase: boolean;
  useNumbers: boolean;
  useSpecial: boolean;
  color: string;
  additionalNotes?: string; // New field
}

export interface UserProfile {
  id: string;
  name: string;
  created: number;
}

export type TabView = 'vault' | 'generator' | 'manual' | 'settings';

export interface CryptoConfig {
  iterations: number;
  keySize: number;
}
import { create } from 'zustand';
import { User, MOCK_USERS } from '../data/mockData';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (username) => {
    // Simple mock auth - find user by name or fallback to first admin
    const user = MOCK_USERS.find(u => u.name.toLowerCase().includes(username.toLowerCase())) || MOCK_USERS[0];
    set({ user, isAuthenticated: true });
  },
  logout: () => set({ user: null, isAuthenticated: false }),
}));

import axios from 'axios';
import { create } from 'zustand';
import { getApiBaseUrl } from '../lib/api-base';

type UiRole = 'operator' | 'supervisor' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  role: UiRole;
  email: string;
  badge: string;
  lastLogin: string;
  shift: 'morning' | 'afternoon' | 'night';
  active: boolean;
}

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
  };
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isBootstrapped: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'vms.auth.token';
const USER_STORAGE_KEY = 'nexusguard.auth.user';
const API_URL = getApiBaseUrl();

function mapRole(role: LoginResponse['user']['role']): UiRole {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'admin';
  if (role === 'OPERATOR') return 'operator';
  return 'supervisor';
}

function mapUser(user: LoginResponse['user'] | MeResponse): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: mapRole(user.role),
    badge: `SEC-${user.id.slice(0, 6).toUpperCase()}`,
    lastLogin: new Date().toISOString(),
    shift: 'morning',
    active: true,
  };
}

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function persistSession(accessToken: string | null, user: AuthUser | null) {
  if (typeof window === 'undefined') return;

  if (accessToken) {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  } else {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  if (user) {
    window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
  }
}

async function fetchMe(accessToken: string) {
  const { data } = await axios.get<MeResponse>(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return mapUser(data);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredUser(),
  accessToken: typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_STORAGE_KEY),
  isAuthenticated: false,
  isLoading: false,
  isBootstrapped: false,
  bootstrap: async () => {
    const accessToken = get().accessToken;

    if (!accessToken) {
      set({ user: null, isAuthenticated: false, isLoading: false, isBootstrapped: true });
      return;
    }

    set({ isLoading: true });

    try {
      const user = await fetchMe(accessToken);
      persistSession(accessToken, user);
      set({ user, isAuthenticated: true, isLoading: false, isBootstrapped: true });
    } catch {
      persistSession(null, null);
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        isBootstrapped: true,
      });
    }
  },
  login: async (email, password) => {
    set({ isLoading: true });

    try {
      const { data } = await axios.post<LoginResponse>(`${API_URL}/auth/login`, { email, password });
      const user = mapUser(data.user);

      persistSession(data.accessToken, user);
      set({
        user,
        accessToken: data.accessToken,
        isAuthenticated: true,
        isLoading: false,
        isBootstrapped: true,
      });
    } catch (error) {
      persistSession(null, null);
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        isBootstrapped: true,
      });
      throw error;
    }
  },
  logout: () => {
    persistSession(null, null);
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      isBootstrapped: true,
    });
  },
}));

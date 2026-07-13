import axios from 'axios';
import { create } from 'zustand';
import { getApiBaseUrl } from '../lib/api-base';

type UiRole = 'viewer' | 'operator' | 'admin';

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
  revalidate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const TOKEN_STORAGE_KEY = 'vms.auth.token';
const USER_STORAGE_KEY = 'nexusguard.auth.user';
const API_URL = getApiBaseUrl();

function mapRole(role: LoginResponse['user']['role']): UiRole {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'admin';
  if (role === 'OPERATOR') return 'operator';
  return 'viewer'; // VIEWER → acesso restrito a Ao Vivo, PTZ e Reprodução
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

  const raw = window.localStorage.getItem(USER_STORAGE_KEY) ?? window.sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function persistSession(accessToken: string | null, user: AuthUser | null) {
  if (typeof window === 'undefined') return;

  if (accessToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  if (user) {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
  } else {
    window.localStorage.removeItem(USER_STORAGE_KEY);
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

function isAuthenticationRejection(error: unknown) {
  return axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: getStoredUser(),
  accessToken: typeof window === 'undefined' ? null : (window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? window.sessionStorage.getItem(TOKEN_STORAGE_KEY)),
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
    } catch (error) {
      if (isAuthenticationRejection(error)) {
        persistSession(null, null);
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      // Uma indisponibilidade momentânea da API não invalida uma sessão que ainda
      // pode ser válida. Mantemos a identidade em cache e a UI disponível; o
      // polling operacional sinaliza que os dados estão desatualizados.
      const cachedUser = get().user ?? getStoredUser();
      set({
        user: cachedUser,
        isAuthenticated: Boolean(cachedUser && accessToken),
        isLoading: false,
        isBootstrapped: true,
      });
    }
  },
  revalidate: async () => {
    // Revalidação periódica da sessão (a cada poucos minutos), executada com a UI
    // já MONTADA e visível. Diferente de `bootstrap`, este caminho NUNCA seta
    // `isLoading: true`: o `ProtectedRoute` renderiza <AppFallback/> (tela cheia
    // "Carregando...") sempre que isLoading é true, o que desmontaria toda a árvore
    // de páginas — e com ela TODOS os <LiveStreamPlayer/>. Isso derrubava as
    // conexões WebRTC de todas as câmeras ao mesmo tempo a cada ciclo, fazendo a
    // imagem "piscar"/reiniciar em lote. Aqui só atualizamos o usuário em segundo
    // plano e, em caso de token expirado/inválido, encerramos a sessão.
    const accessToken = get().accessToken;
    if (!accessToken) {
      if (get().isAuthenticated) {
        set({ user: null, isAuthenticated: false, isBootstrapped: true });
      }
      return;
    }

    try {
      const user = await fetchMe(accessToken);
      persistSession(accessToken, user);
      set({ user, isAuthenticated: true, isBootstrapped: true });
    } catch (error) {
      if (isAuthenticationRejection(error)) {
        persistSession(null, null);
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isBootstrapped: true,
        });
      }
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

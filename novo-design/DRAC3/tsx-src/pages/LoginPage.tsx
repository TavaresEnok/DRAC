import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const { login, isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();

  const getLoginErrorMessage = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return 'Não foi possível autenticar agora. Tente novamente.';
    }

    if (!error.response) {
      return 'Não foi possível conectar à API. Verifique a conexão ou recarregue a página.';
    }

    if (error.response.status === 401) {
      return 'Credenciais inválidas ou usuário inativo';
    }

    return 'Falha no servidor de autenticação. Tente novamente em instantes.';
  };

  useEffect(() => {
    if (isAuthenticated) setLocation('/live');
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('Usuário é obrigatório'); return; }
    if (!password.trim()) { setError('Senha é obrigatória'); return; }
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      setLocation('/live');
    } catch (error) {
      setError(getLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background relative overflow-hidden">

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-4 border-b border-border bg-card/70">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[hsl(var(--primary)_/_0.12)] border border-[hsl(var(--primary)_/_0.22)] flex items-center justify-center">
            <Shield className="w-3 h-3 text-[hsl(var(--primary))]" />
          </div>
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            DRAC VMS
          </span>
        </div>
        <div className="text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums">
          {format(now, 'dd/MM/yyyy HH:mm:ss')}
        </div>
      </div>

      {/* Main form */}
      <div className="relative flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-[380px] rounded-lg border border-border bg-card/80 px-6 py-7 shadow-sm"
        >
          {/* Logo */}
          <div className="text-center mb-7">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[hsl(var(--primary)_/_0.08)] border border-[hsl(var(--primary)_/_0.18)] flex items-center justify-center">
              <Shield className="w-6 h-6 text-[hsl(var(--primary))]" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">DRAC VMS</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5">
              Acesso ao servidor local de monitoramento
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] tracking-wide uppercase" htmlFor="username">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground)_/_0.5)]" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="admin@local.dev"
                  className="w-full h-10 pl-9 pr-4 rounded-md border border-border bg-card/80 text-foreground text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)_/_0.6)] focus:border-[hsl(var(--primary)_/_0.5)] placeholder:text-[hsl(var(--muted-foreground)_/_0.35)] placeholder:font-sans transition-all"
                  data-testid="input-username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-[hsl(var(--muted-foreground))] tracking-wide uppercase" htmlFor="password">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground)_/_0.5)]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••••••"
                  className="w-full h-10 pl-9 pr-10 rounded-md border border-border bg-card/80 text-foreground text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary)_/_0.6)] focus:border-[hsl(var(--primary)_/_0.5)] placeholder:text-[hsl(var(--muted-foreground)_/_0.35)] transition-all"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground)_/_0.45)] hover:text-[hsl(var(--muted-foreground))] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[11px] text-[hsl(354,52%,65%)] bg-[hsl(354_52%_52%_/_0.08)] border border-[hsl(354_52%_52%_/_0.22)] rounded-md px-3 py-2"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Sign-in button — steel blue, elegant */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md text-[13px] font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, hsl(213 72% 54%), hsl(213 65% 49%))',
                color: '#fff',
                boxShadow: '0 1px 3px hsl(213 72% 30% / 0.4)',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '0.92'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1'; }}
              data-testid="button-login"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                  Autenticando...
                </>
              ) : 'Entrar'}
            </button>
          </form>

          {/* Installation card */}
          <div className="mt-6 rounded-md border border-border/60 bg-background/55 px-4 py-3">
            <div className="text-[11px] text-foreground/80 font-medium">Instalação local</div>
            <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
              Autenticação e dados protegidos neste servidor.
            </div>
          </div>

          <div className="mt-4 text-center">
            <span className="text-[10px] text-[hsl(var(--muted-foreground)_/_0.55)]">
              DRAC VMS · Instalação Local
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

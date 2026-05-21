import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session } from '@supabase/supabase-js';
import {
  Loader2, Mail, Key, Eye, EyeOff, Cloud, HardDrive, ArrowRight,
  CheckCircle2, LogIn, UserPlus,
} from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { motion, AnimatePresence } from 'motion/react';
import { AppLogo } from './AppLogo';
import { toast } from 'sonner';
import { celebrate } from './CelebrationOverlay';
import { useDockTheme } from '../contexts/ThemeContext';

const GUEST_KEY  = 'subtitle_bridge_guest_mode';
const USB_PREFIX = 'usb_';

function isNetworkSignupFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return err instanceof TypeError || /failed to fetch|networkerror|load failed|err_/i.test(message);
}

// ─── Cloud → local (reverse sync) ────────────────────────────────────────────
async function reverseSyncFromCloud(session: Session): Promise<number> {
  const doneKey = `subtitle_bridge_reverse_synced_${session.user.id}`;
  if (localStorage.getItem(doneKey)) return 0;
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/migrate`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const data = await res.json();
    if (!res.ok || !data.success) return 0;
    const items: Array<{ key: string; value: unknown }> = data.items ?? [];
    for (const { key, value } of items) {
      if (value !== null && value !== undefined) {
        localStorage.setItem(`${USB_PREFIX}${key}`, JSON.stringify(value));
      }
    }
    localStorage.setItem(doneKey, 'true');
    return items.length;
  } catch (err) {
    console.error('[AuthGuard] Reverse sync error:', err);
    return 0;
  }
}

// ─── Local → cloud (upload migration) ────────────────────────────────────────
async function migrateLocalDataToCloud(session: Session) {
  const doneKey = `subtitle_bridge_migrated_${session.user.id}`;
  if (localStorage.getItem(doneKey)) return;

  const items: Array<{ key: string; value: unknown }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const lsKey = localStorage.key(i);
    if (lsKey?.startsWith(USB_PREFIX)) {
      const originalKey = lsKey.slice(USB_PREFIX.length);
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        try {
          const value = JSON.parse(raw);
          if (value !== undefined && value !== null && value !== '') {
            items.push({ key: originalKey, value });
          }
        } catch { /* skip */ }
      }
    }
  }

  if (items.length === 0) { localStorage.setItem(doneKey, 'true'); return; }

  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/migrate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ items }),
      }
    );
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem(doneKey, 'true');
      celebrate({
        type: 'cloud_synced',
        title: `${items.length} elemento${items.length !== 1 ? 's' : ''} en la nube`,
        subtitle: 'Tu configuración local ya está respaldada ☁️',
        icon: '☁️',
      });
    }
  } catch (err) {
    console.error('[AuthGuard] Upload error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export function AuthGuard({
  children,
  onSessionResolved,
}: {
  children: (
    session: Session | null,
    requestLogin: () => void,
    signOut: () => void
  ) => React.ReactNode;
  onSessionResolved?: (session: Session | null) => void;
}) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [isGuest,   setIsGuest]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  const { t, isSepia } = useDockTheme();

  const [tab,            setTab]            = useState<'login' | 'signup'>('login');
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [showPassword,   setShowPassword]   = useState(false);
  const [error,          setError]          = useState('');
  const [authLoading,    setAuthLoading]    = useState(false);
  const [signupSuccess,  setSignupSuccess]  = useState(false);

  const prevSessionRef = useRef<Session | null | 'unset'>('unset');

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    const guestPref = localStorage.getItem(GUEST_KEY);
    if (guestPref === 'true') {
      setIsGuest(true); setLoading(false); onSessionResolved?.(null); return;
    }
    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (s) {
          const count = await reverseSyncFromCloud(s);
          if (count > 0) celebrate({
            type: 'cloud_synced',
            title: `${count} elemento${count !== 1 ? 's' : ''} restaurado${count !== 1 ? 's' : ''}`,
            subtitle: 'Configuración sincronizada desde la nube ☁️',
            icon: '⬇️',
          });
        }
        setSession(s); setLoading(false); onSessionResolved?.(s);
      })
      .catch((err) => {
        console.error('[AuthGuard] Session bootstrap error:', err);
        setSession(null);
        setLoading(false);
        onSessionResolved?.(null);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) {
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
        // Welcome back celebration on sign-in events
        if (event === 'SIGNED_IN') {
          const name = s.user.email?.split('@')[0] ?? 'estudiante';
          celebrate({
            type: 'login_welcome',
            title: `¡Bienvenido, ${name}!`,
            subtitle: 'Tu configuración y tarjetas están sincronizadas en la nube ☁️',
            icon: '👋',
          });
        }
      }
      onSessionResolved?.(s);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── First login → upload migration ───────────────────────────────────────
  useEffect(() => {
    if (prevSessionRef.current === 'unset') { prevSessionRef.current = session; return; }
    if (!prevSessionRef.current && session) migrateLocalDataToCloud(session);
    prevSessionRef.current = session;
  }, [session]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const requestLogin = () => { localStorage.removeItem(GUEST_KEY); setIsGuest(false); };
  const signOut = async () => {
    localStorage.removeItem(GUEST_KEY); setIsGuest(false);
    await supabase.auth.signOut(); onSessionResolved?.(null);
  };

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setAuthLoading(true);
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      } else {
        let serverSignupCreated = false;
        try {
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/signup`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
              body: JSON.stringify({ email, password }),
            }
          );
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`);
          serverSignupCreated = true;
        } catch (signupErr) {
          if (!isNetworkSignupFailure(signupErr)) throw signupErr;
          console.warn('[AuthGuard] Signup endpoint unreachable; using local auth fallback.', signupErr);
        }
        if (!serverSignupCreated) {
          const { error: signupDirectErr } = await supabase.auth.signUp({ email, password });
          if (signupDirectErr) throw new Error(signupDirectErr.message);
        }
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (loginErr) { setSignupSuccess(true); setTab('login'); setAuthLoading(false); return; }
      }
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
    } finally { setAuthLoading(false); }
  };

  const handleGoogleOAuth = async () => {
    setError(''); setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con Google'); setAuthLoading(false);
    }
  };

  const handleGuest = () => {
    localStorage.setItem(GUEST_KEY, 'true'); setIsGuest(true); onSessionResolved?.(null);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${t("bg-[#1a1b1d]", "bg-[#f8f7f6]")}`}>
        <Loader2 className="animate-spin text-violet-500" size={20} />
      </div>
    );
  }

  // ── Authenticated / Guest → render children ───────────────────────────────
  if (session || isGuest) return <>{children(session, requestLogin, signOut)}</>;

  // ── Auth screen — fills the extension sidebar panel completely ────────────
  return (
    <div className={`flex flex-col h-full w-full overflow-y-auto ${t("bg-[#0f1012]", "bg-[#f8f7f6]")}`}
      style={{ scrollbarWidth: 'thin', scrollbarColor: isSepia ? 'rgba(0,0,0,0.12) transparent' : 'rgba(255,255,255,0.1) transparent' }}
    >
      {/* Brand header */}
      <div className="flex flex-col items-center pt-7 pb-3 px-5">
        <div className="w-11 h-11 rounded-2xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center mb-3 shadow-[0_0_28px_rgba(139,92,246,0.18)]">
          <AppLogo size={22} iconOnly />
        </div>
        <h2 className="text-white text-[15px] tracking-tight" style={{ fontWeight: 700 }}>
          Subtitle Bridge
        </h2>
        <p className="text-white/35 text-[11px] mt-1 text-center leading-relaxed">
          Accede para sincronizar tu progreso<br />en todos tus dispositivos
        </p>
      </div>

      {/* Feature comparison */}
      <div className="px-3 mb-3 grid grid-cols-2 gap-2">
        {/* Guest */}
        <div className="rounded-xl border border-white/6 bg-white/[0.03] p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <HardDrive size={9} className="text-white/30" />
            <span className="text-white/40 text-[9px]" style={{ fontWeight: 600 }}>Sin cuenta</span>
          </div>
          {['Traducción en vivo', 'Overlay en Udemy', 'Tarjetas Anki (local)'].map(f => (
            <div key={f} className="flex items-center gap-1.5">
              <CheckCircle2 size={8} className="text-emerald-500/60 shrink-0" />
              <span className="text-white/30 text-[10px]">{f}</span>
            </div>
          ))}
          {['Sync cross-device', 'Backup nube'].map(f => (
            <div key={f} className="flex items-center gap-1.5">
              <div className="w-2 h-px bg-white/15 shrink-0 ml-px" />
              <span className="text-white/18 text-[10px]">{f}</span>
            </div>
          ))}
        </div>
        {/* Account */}
        <div className="rounded-xl border border-violet-500/22 bg-violet-500/[0.05] p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Cloud size={9} className="text-violet-400" />
            <span className="text-violet-300/70 text-[9px]" style={{ fontWeight: 600 }}>Con cuenta</span>
          </div>
          {['Traducción en vivo', 'Overlay en Udemy', 'Tarjetas Anki (local)'].map(f => (
            <div key={f} className="flex items-center gap-1.5">
              <CheckCircle2 size={8} className="text-emerald-500/60 shrink-0" />
              <span className="text-white/30 text-[10px]">{f}</span>
            </div>
          ))}
          {['Sync cross-device', 'Backup nube'].map(f => (
            <div key={f} className="flex items-center gap-1.5">
              <CheckCircle2 size={8} className="text-violet-400 shrink-0" />
              <span className="text-white/45 text-[10px]">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Auth card — full width */}
      <div className="mx-3 bg-[#141416] border border-white/8 rounded-2xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/6">
          {(['login', 'signup'] as const).map(tabId => (
            <button
              key={tabId}
              onClick={() => { setTab(tabId); setError(''); setSignupSuccess(false); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] transition-all relative ${
                tab === tabId ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
              style={{ fontWeight: tab === tabId ? 600 : 400 }}
            >
              {tabId === 'login' ? <LogIn size={11} /> : <UserPlus size={11} />}
              {tabId === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              {tab === tabId && (
                <motion.div
                  layoutId="authTabLine"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-violet-500 rounded-t-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {/* Banners */}
          <AnimatePresence>
            {signupSuccess && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 flex items-start gap-2">
                <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-emerald-300 text-[11px] leading-relaxed">¡Cuenta creada! Inicia sesión.</p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                <p className="text-red-400 text-[11px] leading-relaxed">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google */}
          <button type="button" onClick={handleGoogleOAuth} disabled={authLoading}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/12 hover:border-white/20 text-white/70 hover:text-white text-[11px] transition-all disabled:opacity-40"
            style={{ fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-white/20 text-[10px]">o con email</span>
            <div className="flex-1 h-px bg-white/6" />
          </div>

          <form onSubmit={handleAuth} className="space-y-2">
            <div className="relative">
              <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input type="email" required autoComplete="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className="w-full bg-white/5 border border-white/8 rounded-lg py-2 pl-8 pr-3 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:bg-white/7 transition-all"
                placeholder="correo@ejemplo.com" />
            </div>
            <div className="relative">
              <Key size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input type={showPassword ? 'text' : 'password'} required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'signup' ? 6 : undefined}
                value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                className="w-full bg-white/5 border border-white/8 rounded-lg py-2 pl-8 pr-8 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:bg-white/7 transition-all"
                placeholder={tab === 'signup' ? 'Mínimo 6 caracteres' : 'Contraseña'} />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors">
                {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <button type="submit" disabled={authLoading}
              className="w-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white rounded-lg py-2 text-[12px] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(139,92,246,0.22)]"
              style={{ fontWeight: 600 }}>
              {authLoading ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            </button>
          </form>
        </div>
      </div>

      {/* Guest CTA */}
      <div className="flex items-center gap-2 mx-3 my-3">
        <div className="flex-1 h-px bg-white/6" />
        <span className="text-white/20 text-[10px]">sin cuenta</span>
        <div className="flex-1 h-px bg-white/6" />
      </div>

      <div className="mx-3 mb-5">
        <button onClick={handleGuest}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-white/7 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/12 text-white/45 hover:text-white/70 transition-all group">
          <div className="flex items-center gap-2.5">
            <HardDrive size={12} className="shrink-0" />
            <div className="text-left">
              <p className="text-[11px]" style={{ fontWeight: 500 }}>Continuar sin cuenta</p>
              <p className="text-[10px] text-white/25 mt-0.5">Datos solo en este dispositivo</p>
            </div>
          </div>
          <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>
      </div>
    </div>
  );
}

export function useGuestMode() {
  const clearGuestMode = () => localStorage.removeItem(GUEST_KEY);
  return { clearGuestMode };
}

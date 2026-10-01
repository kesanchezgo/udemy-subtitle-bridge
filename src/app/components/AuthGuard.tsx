import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { Session } from '@supabase/supabase-js';
import {
  Loader2, Mail, Key, Eye, EyeOff, HardDrive, Cloud, Check, ArrowRight,
  CheckCircle2, LogIn, UserPlus,
} from './icons';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { motion, AnimatePresence } from 'motion/react';
import { KinemaBrand } from './AppLogo';
import { toast } from 'sonner';
import { GoogleLogo } from '@phosphor-icons/react';
import { celebrate } from './CelebrationOverlay';
import { useDockTheme } from '../contexts/ThemeContext';
import {
  historyService,
  cloudKeyForLecture,
  CLOUD_HISTORY_PREFIX,
  CLOUD_HISTORY_LEGACY_BUNDLE_KEY,
  type LectureHistoryRecord,
} from '../services/historyService';

const GUEST_KEY  = 'subtitle_bridge_guest_mode';
const USB_PREFIX = 'usb_';
// Max items per /migrate POST. Edge functions have a request size cap and
// individual study records with AI feedback can be several KB each.
const MIGRATE_CHUNK_SIZE = 30;
const HISTORY_SYNC_DEBOUNCE_MS = 1200;

function isNetworkSignupFailure(err: unknown): boolean {
  // Only treat actual transport failures as a network error. Supabase surfaces
  // logical failures as Error objects carrying a numeric `status` (or a
  // `code` like "email_exists"); those must propagate, not be swallowed.
  if (err instanceof TypeError) return true;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status > 0) return false;
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.trim()) return false;
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|err_connection|err_name_not_resolved|err_internet_disconnected/i.test(message);
}

async function postMigrationItems(
  session: Session,
  items: Array<{ key: string; value: unknown }>
): Promise<number | null> {
  if (items.length === 0) return 0;

  const chunks: Array<typeof items> = [];
  for (let i = 0; i < items.length; i += MIGRATE_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + MIGRATE_CHUNK_SIZE));
  }

  let uploaded = 0;
  for (const chunk of chunks) {
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/migrate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ items: chunk }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        uploaded += chunk.length;
      } else {
        console.error('[AuthGuard] Upload chunk failed', data);
        return null;
      }
    } catch (err) {
      console.error('[AuthGuard] Upload error:', err);
      return null;
    }
  }

  return uploaded;
}

async function syncHistoryToCloud(
  session: Session,
  records?: LectureHistoryRecord[]
): Promise<number> {
  const historyRecords = records ?? await historyService.exportAll();
  const items = historyRecords.map((rec) => ({
    key: cloudKeyForLecture(rec.courseId, rec.lectureId),
    value: rec,
  }));
  const uploaded = await postMigrationItems(session, items);
  return uploaded ?? 0;
}

// ─── Cloud → local (reverse sync) ────────────────────────────────────────────
async function reverseSyncFromCloud(session: Session): Promise<number> {
  const doneKey = `subtitle_bridge_reverse_synced_${session.user.id}`;
  const alreadyReported = localStorage.getItem(doneKey) === 'true';
  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/migrate`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    const data = await res.json();
    if (!res.ok || !data.success) return 0;
    const items: Array<{ key: string; value: unknown }> = data.items ?? [];

    // Collect history records (per-lecture keys + legacy bundle) and import in one batch.
    const historyRecords: LectureHistoryRecord[] = [];
    for (const { key, value } of items) {
      if (value === null || value === undefined) continue;

      if (key === CLOUD_HISTORY_LEGACY_BUNDLE_KEY) {
        const arr = Array.isArray(value) ? (value as LectureHistoryRecord[]) : [];
        historyRecords.push(...arr);
        continue;
      }
      if (key.startsWith(CLOUD_HISTORY_PREFIX)) {
        historyRecords.push(value as LectureHistoryRecord);
        continue;
      }
      localStorage.setItem(`${USB_PREFIX}${key}`, JSON.stringify(value));
    }

    if (historyRecords.length > 0) {
      try {
        await historyService.importAll(historyRecords);
      } catch (e) {
        console.error('[AuthGuard] history import failed', e);
      }
    }
    localStorage.setItem(doneKey, 'true');
    return alreadyReported ? 0 : items.length;
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

  // Attach persistent study history — one row per lecture (server stores each key
  // separately in kv_store, so this naturally avoids a single oversized payload).
  try {
    const records = await historyService.exportAll();
    for (const rec of records) {
      items.push({ key: cloudKeyForLecture(rec.courseId, rec.lectureId), value: rec });
    }
  } catch (e) {
    console.error('[AuthGuard] history export failed', e);
  }

  if (items.length === 0) { localStorage.setItem(doneKey, 'true'); return; }

  const uploaded = await postMigrationItems(session, items);
  if (uploaded === null) return; // bail without marking done so next session retries

  localStorage.setItem(doneKey, 'true');
  if (uploaded > 0) {
    celebrate({
      type: 'cloud_synced',
      title: `${uploaded} elemento${uploaded !== 1 ? 's' : ''} en la nube`,
      subtitle: 'Tu configuración local ya está respaldada',
    });
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

  const { t } = useDockTheme();

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
          await syncHistoryToCloud(s).catch((err) => {
            console.error('[AuthGuard] history startup sync failed', err);
          });
          if (count > 0) celebrate({
            type: 'cloud_synced',
            title: `${count} elemento${count !== 1 ? 's' : ''} restaurado${count !== 1 ? 's' : ''}`,
            subtitle: 'Configuración sincronizada desde la nube',
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
            subtitle: 'Tu configuración y tarjetas están sincronizadas en la nube',
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

  // ── Continuous history sync ──────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Map<string, LectureHistoryRecord>();

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending.size === 0) return;
      const records = Array.from(pending.values());
      pending.clear();
      syncHistoryToCloud(session, records).catch((err) => {
        console.error('[AuthGuard] history live sync failed', err);
      });
    };

    const unsubscribe = historyService.onChanged((records) => {
      for (const rec of records) {
        pending.set(`${rec.courseId}::${rec.lectureId}`, rec);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, HISTORY_SYNC_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      flush();
    };
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
      <div className="flex-1 flex items-center justify-center bg-[var(--usb-bg-2)]">
        <Loader2 className="animate-spin text-[#6d4aff]" size={20} />
      </div>
    );
  }

  // ── Authenticated / Guest → render children ───────────────────────────────
  if (session || isGuest) return <>{children(session, requestLogin, signOut)}</>;

  // ── Auth screen — mismo lenguaje que el resto del dock ────────────────────
  const fieldCls = "kx-field w-full h-11 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] text-[12.5px] text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] focus:outline-none focus:border-[#6d4aff] focus:ring-2 focus:ring-[#6d4aff]/25 transition-colors font-medium";
  const iconCls = "absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--usb-fg-lo)] pointer-events-none transition-colors group-focus-within:text-[#6d4aff]";
  const violetInk = t("#b7a6ff", "#5b37e8");
  const rise = (i: number) => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const, delay: 0.06 * i },
  });
  const isLogin = tab === 'login';
  const features: Array<[string, boolean]> = [
    ['Traducción en vivo', true],
    ['Overlay en Udemy', true],
    ['Tarjetas Anki', true],
    ['Sync entre dispositivos', false],
    ['Backup en la nube', false],
  ];

  return (
    <div className="kx-page flex flex-col h-full w-full overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[var(--usb-bg-2)]">
      {/* Hero */}
      <motion.div {...rise(0)} className="kx-hero-solid relative overflow-hidden rounded-2xl p-4.5" style={{ ["--kinema-wordmark" as string]: "#fff", ["--kinema-signature" as string]: "#e4dcff" }}>
        <span className="kx-ring kx-ring-1" aria-hidden="true" />
        <div className="relative">
          <KinemaBrand dense />
          <p className="kx-hero-t1 text-[21px] font-extrabold tracking-tight leading-tight mt-5">
            Tu progreso, en cada pantalla
          </p>
          <p className="kx-hero-t2 text-[12px] leading-relaxed mt-1.5">
            Sincroniza tu historial, tus tarjetas y tu XP entre dispositivos.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {([[Cloud, 'Sync'], [Check, 'Backup'], [HardDrive, 'Funciona sin cuenta']] as const).map(([Ico, label]) => (
              <span key={label} className="kx-hero-chip text-[10.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Ico size={12} />{label}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Auth card */}
      <motion.div {...rise(1)} className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl p-4 pt-5 space-y-4">
        <div>
          <span className="kx-slate block" style={{ color: violetInk }}>{isLogin ? 'Bienvenido de vuelta' : 'Empieza gratis'}</span>
          <h2 className="mt-1 text-[16px] font-extrabold tracking-tight text-[var(--usb-fg-hi)]">
            {isLogin ? 'Inicia sesión' : 'Crea tu cuenta'}
          </h2>
        </div>

        <div className="kx-seg" role="tablist">
          {(['login', 'signup'] as const).map(tabId => {
            const active = tab === tabId;
            return (
              <button
                key={tabId}
                role="tab"
                aria-selected={active}
                onClick={() => { setTab(tabId); setError(''); setSignupSuccess(false); }}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${active ? 'kx-tab-on' : 'text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]'}`}
              >
                {active && (
                  <motion.span layoutId="authTabPill" className="kx-seg-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }} />
                )}
                <span className="relative">{tabId === 'login' ? <LogIn size={13} /> : <UserPlus size={13} />}</span>
                <span className="relative" style={{ fontWeight: active ? 600 : 500 }}>{tabId === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</span>
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {signupSuccess && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              role="status" className="kx-ok-strip rounded-xl p-3 flex items-start gap-2 overflow-hidden">
              <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-[12px] leading-relaxed text-[var(--usb-fg)]">Cuenta creada. Inicia sesión para continuar.</p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              role="alert" className="rounded-xl p-3 border border-rose-500/30 bg-rose-500/10 overflow-hidden">
              <p className="text-[12px] leading-relaxed" style={{ color: t("#fda4af", "#be123c") }}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button type="button" onClick={handleGoogleOAuth} disabled={authLoading}
          className="w-full h-11 rounded-xl border border-[#747775] bg-white text-[13px] font-medium text-[#1f1f1f] flex items-center justify-center gap-3 transition-colors hover:bg-[#f1f3f4] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continuar con Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--usb-divider)]" />
          <span className="kx-slate text-[var(--usb-fg-mid)]">o con email</span>
          <div className="flex-1 h-px bg-[var(--usb-divider)]" />
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="kx-slate block text-[var(--usb-fg-mid)]">Correo</span>
            <div className="relative group">
              <Mail size={15} className={iconCls} />
              <input type="email" required autoComplete="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className={`${fieldCls} pl-10 pr-3.5`}
                placeholder="correo@ejemplo.com" />
            </div>
          </label>
          <label className="block space-y-1.5">
            <span className="kx-slate block text-[var(--usb-fg-mid)]">Contraseña</span>
            <div className="relative group">
              <Key size={15} className={iconCls} />
              <input type={showPassword ? 'text' : 'password'} required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={!isLogin ? 6 : undefined}
                value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                className={`${fieldCls} pl-10 pr-11`}
                placeholder={!isLogin ? 'Mínimo 6 caracteres' : 'Tu contraseña'} />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors p-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <button type="submit" disabled={authLoading}
            className="kx-on-solid kx-cta w-full h-11 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--usb-bg-3)]">
            {authLoading ? <Loader2 size={15} className="animate-spin" /> : (isLogin ? <LogIn size={15}/> : <UserPlus size={15}/>)}
            {isLogin ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            {!authLoading && <ArrowRight size={15}/>}
          </button>
        </form>
      </motion.div>

      {/* Qué incluye cada modo */}
      <motion.div {...rise(2)} className="bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl p-4 space-y-2.5">
        <div className="grid grid-cols-[1fr_64px_64px] items-center gap-2">
          <span className="kx-slate text-[var(--usb-fg-mid)]">Qué incluye</span>
          <span className="kx-slate text-center text-[var(--usb-fg-mid)]">Invitado</span>
          <span className="kx-slate text-center" style={{ color: violetInk }}>Cuenta</span>
        </div>
        {features.map(([f, guest]) => (
          <div key={f} className="grid grid-cols-[1fr_64px_64px] items-center gap-2 py-1.5 border-t border-[var(--usb-divider)]">
            <span className="text-[11.5px] font-medium text-[var(--usb-fg)]">{f}</span>
            <span className="flex justify-center">
              {guest
                ? <Check size={14} strokeWidth={2.8} className="text-emerald-500" aria-label="Incluido" />
                : <span className="h-px w-3 bg-[var(--usb-fg-dim)]" aria-label="No incluido" />}
            </span>
            <span className="flex justify-center">
              <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, #6d4aff 16%, var(--usb-bg-3))', color: violetInk }}>
                <Check size={12} strokeWidth={3} aria-label="Incluido" />
              </span>
            </span>
          </div>
        ))}
      </motion.div>

      {/* Guest CTA */}
      <motion.button {...rise(3)} onClick={handleGuest}
        className="group w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)] transition-colors hover:border-[#6d4aff]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[var(--usb-bg-2)] border border-[var(--usb-border)] text-[var(--usb-fg-mid)]">
          <HardDrive size={17} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)]">Continuar sin cuenta</p>
          <p className="text-[11.5px] text-[var(--usb-fg-mid)] mt-0.5 font-medium">Tus datos se quedan en este dispositivo</p>
        </div>
        <ArrowRight size={16} className="text-[var(--usb-fg-mid)] group-hover:translate-x-1 group-hover:text-[var(--usb-fg-hi)] transition-all shrink-0" />
      </motion.button>
      <div className="h-1 shrink-0" />
    </div>
  );
}

export function useGuestMode() {
  const clearGuestMode = () => localStorage.removeItem(GUEST_KEY);
  return { clearGuestMode };
}

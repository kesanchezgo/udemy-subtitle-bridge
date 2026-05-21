import { createClient, type Session } from '@supabase/supabase-js';
import { publicAnonKey, supabaseUrl } from '../../../utils/supabase/info';

type AuthListener = (event: string, session: Session | null) => void;

type PasswordCredentials = {
  email: string;
  password: string;
};

type OAuthOptions = {
  provider: string;
  options?: {
    redirectTo?: string;
  };
};

type AuthResult = {
  data: {
    session: Session | null;
    user: Session['user'] | null;
  };
  error: { message: string } | null;
};

type AuthClientSubset = {
  auth: {
    getSession(): Promise<{ data: { session: Session | null }; error: { message: string } | null }>;
    onAuthStateChange(callback: AuthListener): {
      data: {
        subscription: {
          unsubscribe(): void;
        };
      };
    };
    signInWithPassword(credentials: PasswordCredentials): Promise<AuthResult>;
    signInWithOAuth(options: OAuthOptions): Promise<{ data: unknown; error: { message: string } | null }>;
    signUp(credentials: PasswordCredentials): Promise<AuthResult>;
    signOut(): Promise<{ error: { message: string } | null }>;
  };
};

const STORAGE_KEY = 'usb_mock_supabase_session';
const listeners = new Set<AuthListener>();

const hasSupabaseConfig =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) &&
  publicAnonKey.length > 20;

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeSession(session: Session | null) {
  if (typeof window === 'undefined') return;
  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

function notify(event: string, session: Session | null) {
  for (const listener of listeners) listener(event, session);
}

function createMockSession(email: string, provider: string): Session {
  const now = new Date().toISOString();
  const safeEmail = email.trim().toLowerCase() || `${provider}@local.test`;
  const userId = `usb_${provider}_${safeEmail.replace(/[^a-z0-9]+/gi, '_')}`;

  return {
    access_token: `mock_${provider}_${Date.now()}`,
    refresh_token: `mock_refresh_${Date.now()}`,
    expires_in: 60 * 60 * 24 * 30,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: safeEmail,
      phone: '',
      created_at: now,
      updated_at: now,
      app_metadata: { provider, providers: [provider] },
      user_metadata: { provider },
      identities: [],
      factors: [],
    },
  } as Session;
}

const mockSupabase: AuthClientSubset = {
  auth: {
    async getSession() {
      return { data: { session: readSession() }, error: null };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      callback('INITIAL_SESSION', readSession());

      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },
    async signInWithPassword(credentials: PasswordCredentials) {
      const session = createMockSession(credentials.email, 'email');
      writeSession(session);
      notify('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    async signInWithOAuth(options: OAuthOptions) {
      const provider = options.provider || 'oauth';
      const session = createMockSession(`${provider}@oauth.local`, provider);
      writeSession(session);
      notify('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    async signUp(credentials: PasswordCredentials) {
      const session = createMockSession(credentials.email, 'email');
      writeSession(session);
      notify('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    async signOut() {
      writeSession(null);
      notify('SIGNED_OUT', null);
      return { error: null };
    },
  },
};

const realSupabase = hasSupabaseConfig
  ? createClient(supabaseUrl, publicAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isUsingMockSupabase = !realSupabase;
export const supabase = (realSupabase ?? mockSupabase) as unknown as AuthClientSubset;

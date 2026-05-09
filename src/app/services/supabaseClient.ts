import type { Session } from '@supabase/supabase-js';

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

const STORAGE_KEY = 'usb_mock_supabase_session';
const listeners = new Set<AuthListener>();

function readSession(): Session | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function notify(event: string, session: Session | null) {
  for (const listener of listeners) {
    listener(event, session);
  }
}

function createSession(email: string, provider: string): Session {
  const now = new Date().toISOString();
  const userId = `usb_${provider}_${email.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'guest'}`;
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
      email,
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

export const supabase = {
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
      const session = createSession(credentials.email, 'email');
      writeSession(session);
      notify('SIGNED_IN', session);
      return { data: { session, user: session.user }, error: null };
    },
    async signInWithOAuth(options: OAuthOptions) {
      const session = createSession(`${options.provider}@oauth.local`, options.provider);
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
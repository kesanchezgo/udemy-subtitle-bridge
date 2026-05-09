const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

export const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();

export const projectId = (
	env.VITE_SUPABASE_PROJECT_ID?.trim() ||
	supabaseUrl.replace(/^https:\/\//, '').split('.')[0] ||
	''
).trim();

export const publicAnonKey = (
	env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
	env.VITE_SUPABASE_ANON_KEY?.trim() ||
	''
).trim();
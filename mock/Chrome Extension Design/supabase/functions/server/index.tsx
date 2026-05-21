import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Sign up route
app.post("/make-server-e0dd828c/signup", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ success: false, error: "Email y contraseña son requeridos" }, 400);
    }
    if (password.length < 6) {
      return c.json({ success: false, error: "La contraseña debe tener al menos 6 caracteres" }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    
    if (error) {
      const msg = error.message || String(error);
      console.error("Signup error from Supabase:", msg);
      return c.json({ success: false, error: msg }, 400);
    }

    return c.json({ success: true, user: data.user });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Signup unexpected error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// GET all Anki cards for a user
app.get("/make-server-e0dd828c/anki", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ success: false, error: "Missing userId" }, 400);
    const cards = await kv.getByPrefix(`anki_${userId}_`);
    return c.json({ success: true, cards });
  } catch (error) {
    console.error("Error fetching anki cards:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// POST save a single Anki card or multiple
app.post("/make-server-e0dd828c/anki", async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.req.query("userId");
    if (!userId) return c.json({ success: false, error: "Missing userId" }, 400);

    if (Array.isArray(body)) {
      const keys = body.map((card: any) => `anki_${userId}_${card.id}`);
      await kv.mset(keys, body);
    } else {
      await kv.set(`anki_${userId}_${body.id}`, body);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error("Error saving anki cards:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// DELETE an Anki card
app.delete("/make-server-e0dd828c/anki/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.req.query("userId");
    if (!userId) return c.json({ success: false, error: "Missing userId" }, 400);

    await kv.del(`anki_${userId}_${id}`);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// GET study progress
app.get("/make-server-e0dd828c/progress", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) return c.json({ success: false, error: "Missing userId" }, 400);
    const progress = await kv.get(`user_progress_${userId}`);
    return c.json({ success: true, progress: progress || {} });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// POST save study progress
app.post("/make-server-e0dd828c/progress", async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.req.query("userId");
    if (!userId) return c.json({ success: false, error: "Missing userId" }, 400);
    
    await kv.set(`user_progress_${userId}`, body);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// POST migrate local data to cloud
app.post("/make-server-e0dd828c/migrate", async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ success: false, error: 'Authorization header missing' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      console.error("Auth error on migrate:", authError?.message);
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const items: Array<{ key: string; value: unknown }> = body.items;

    if (!Array.isArray(items)) {
      return c.json({ success: false, error: 'items must be an array' }, 400);
    }

    // Store each item keyed by user id
    for (const item of items) {
      if (!item.key || item.value === undefined) continue;
      await kv.set(`cloud_${user.id}_${item.key}`, item.value);
    }

    // Maintain a manifest of all keys so we can list them on reverse-sync
    const existingManifest = (await kv.get(`cloud_${user.id}__manifest`) as string[] | null) ?? [];
    const newKeys = items.map((i) => i.key).filter((k) => !existingManifest.includes(k));
    if (newKeys.length > 0) {
      await kv.set(`cloud_${user.id}__manifest`, [...existingManifest, ...newKeys]);
    }

    console.log(`[migrate] user=${user.id} migrated ${items.length} items`);
    return c.json({ success: true, migrated: items.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Migration unexpected error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// GET migrated cloud data for a user (reverse sync: cloud → local)
app.get("/make-server-e0dd828c/migrate", async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ success: false, error: 'Authorization header missing' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return c.json({ success: false, error: 'Unauthorized' }, 401);

    // Use manifest to reconstruct key-value pairs
    const manifest = (await kv.get(`cloud_${user.id}__manifest`) as string[] | null) ?? [];
    const items: Array<{ key: string; value: unknown }> = [];
    for (const key of manifest) {
      const value = await kv.get(`cloud_${user.id}_${key}`);
      if (value !== null && value !== undefined) {
        items.push({ key, value });
      }
    }

    return c.json({ success: true, items, count: items.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: msg }, 500);
  }
});

Deno.serve(app.fetch);
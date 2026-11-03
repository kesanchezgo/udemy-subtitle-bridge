// Credenciales de Udemy para los scripts de QA.
//
// NO hardcodear valores aquí ni en los scripts: el repositorio es público y
// cualquier literal queda en el historial de git para siempre.
//
// Orden de búsqueda:
//   1. .qa-udemy-cookies.json (raíz del repo, IGNORADO por git) — el formato que
//      exporta la extensión o un exportador de cookies.
//   2. Variables de entorno UDEMY_<NOMBRE> (p. ej. UDEMY_UD_USER_JWT).
//
// Uso:  import { udemySecret, udemyCookies } from './udemy-cookie.mjs';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILE = path.join(repoRoot, '.qa-udemy-cookies.json');

let cache = null;

function loadFile() {
  if (cache !== null) return cache;
  const file = process.env.USB_COOKIES || DEFAULT_FILE;
  if (!existsSync(file)) {
    cache = [];
    return cache;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Valor de una cookie por nombre. Lanza si no está disponible. */
export function udemySecret(name) {
  const envKey = `UDEMY_${name.toUpperCase()}`;
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  const found = loadFile().find((c) => c && c.name === name);
  if (found && found.value) return String(found.value).replace(/^"|"$/g, '');
  throw new Error(
    `Falta la cookie «${name}»: exporta .qa-udemy-cookies.json en la raíz del repo ` +
    `(ignorado por git) o define ${envKey}. No la escribas en el código.`,
  );
}

/** Las cookies del archivo listas para browser.addCookies() (dominio .udemy.com). */
export function udemyCookies() {
  const raw = loadFile();
  if (!raw.length) {
    throw new Error(
      'Falta .qa-udemy-cookies.json (raíz del repo, ignorado por git). ' +
      'Es el único sitio donde deben vivir las cookies de sesión.',
    );
  }
  return raw.map((c) => ({
    name: c.name,
    value: String(c.value).replace(/^"|"$/g, ''),
    domain: c.domain || '.udemy.com',
    path: c.path || '/',
    secure: c.secure !== false,
    httpOnly: Boolean(c.httpOnly),
    ...(c.expirationDate ? { expires: Math.floor(c.expirationDate) } : {}),
  }));
}
import React, { useCallback, useEffect, useState } from 'react';
import { THEME_CSS } from '../styles/sepia-overrides';
import { primaryBtnCls } from './settings/SettingsKit';

type PageTheme = 'dark' | 'sepia';

/**
 * Página propia de la extensión para conceder permiso de red.
 *
 * Por qué existe: `chrome.permissions.request` solo funciona desde un contexto
 * con gesto de usuario. El dock del panel vive en el content script, donde
 * `chrome.permissions` no existe, y el service worker —que sí lo tiene— rechaza
 * la llamada con "This function must be called during a user gesture". Esta
 * página es el único sitio donde el clic del usuario llega a la API.
 *
 * Comprobado también: chrome://extensions → Acceso a sitios NO permite añadir
 * un host arbitrario cuando el permiso es opcional; solo activa o desactiva los
 * que el manifest ya declara. Así que no había ruta manual que funcionase.
 *
 * Se abre con ?origin=https://host-elegido para saber exactamente qué permiso
 * pedir y ?theme=dark|sepia para usar los mismos tokens que el dock (si no
 * viene, cae al prefers-color-scheme del sistema).
 */
function resolveTheme(): PageTheme {
  const raw = new URLSearchParams(window.location.search).get('theme');
  if (raw === 'sepia' || raw === 'dark') return raw;
  // Sin tema en la URL (p. ej. abierta desde chrome://extensions → Opciones):
  // seguir el esquema del sistema.
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'sepia' : 'dark';
}

export function PermissionPage() {
  const [theme, setTheme] = useState<PageTheme>('dark');
  const [origin, setOrigin] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'granted' | 'denied' | 'done'>('idle');
  const [message, setMessage] = useState('Pulsa el botón para que Chrome te pregunte.');

  useEffect(() => {
    setTheme(resolveTheme());
    const raw = new URLSearchParams(window.location.search).get('origin');
    let pattern: string | null = null;
    let host: string | null = null;
    try {
      const url = new URL(raw ?? '');
      pattern = `${url.origin}/*`;
      host = url.origin;
    } catch {
      pattern = null;
      host = null;
    }
    setOrigin(pattern);
    setHost(host);
    if (!pattern) {
      setState('done');
      setMessage('Abre esta página desde Ajustes → Proveedor de IA.');
      return;
    }
    // Si ya está concedido, no hace falta preguntar de nuevo.
    // El proyecto no tiene tipos globales de chrome: se accede por globalThis,
    // igual que en el resto del código.
    const api = (globalThis as typeof globalThis & { chrome?: { permissions?: { contains?: (q: { origins: string[] }) => Promise<boolean> } } }).chrome;
    void api?.permissions?.contains?.({ origins: [pattern] }).then((has) => {
      if (has) {
        setState('granted');
        setMessage('Este endpoint ya tenía permiso concedido. Puedes cerrar esta pestaña.');
      }
    }).catch(() => undefined);
  }, []);

  const ask = useCallback(async () => {
    if (!origin) return;
    setState('asking');
    setMessage('Chrome te preguntará si permitir este endpoint…');
    const api = (globalThis as typeof globalThis & { chrome?: { permissions?: { request?: (q: { origins: string[] }) => Promise<boolean> } } }).chrome;
    if (!api?.permissions?.request) {
      setState('denied');
      setMessage('Este navegador no permite conceder permisos desde la extensión.');
      return;
    }
    try {
      // Timeout propio: si el diálogo no llega a resolverse (navegador que lo
      // suprime, gesto perdido), la promesa se queda colgada y el usuario vería
      // la página congelada para siempre. Mejor decírselo y dejar reintentar.
      // La llamada es directa al método, no a una referencia suelta: las APIs de
      // Chrome rechazan la invocación sin su this ("Illegal invocation").
      const granted = await Promise.race([
        api.permissions.request({ origins: [origin] }),
        new Promise<boolean>((_, reject) => setTimeout(
          () => reject(new Error('Chrome no respondió a la petición de permiso.')),
          30000,
        )),
      ]);
      if (granted) {
        setState('granted');
        setMessage('Permiso concedido. Vuelve a la pestaña del curso y pulsa Guardar.');
        // No se emite ningún evento local: esta pestaña no es la del dock y un
        // CustomEvent no cruza pestañas. El aviso al panel lo reenvía el service
        // worker al recibir chrome.permissions.onAdded.
      } else {
        setState('denied');
        setMessage('No se concedió el permiso. Las peticiones a ese endpoint seguirán bloqueadas.');
      }
    } catch (error) {
      setState('denied');
      setMessage(error instanceof Error ? error.message : 'No se pudo pedir el permiso.');
    }
  }, [origin]);

  // Mismos tokens que el dock: la página se envuelve en .usb-dock (y
  // .dock-sepia cuando toca) y recibe THEME_CSS, así que --usb-bg-*, --usb-fg-*
  // y --usb-border valen aquí igual que dentro del dock.
  const isSepia = theme === 'sepia';
  // Texto de éxito con contraste AA en ambos temas: emerald claro sobre oscuro,
  // emerald-600 sobre claro/sepia.
  const okColor = isSepia ? '#059669' : '#34d399';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      <main
        className={`usb-dock ${isSepia ? 'dock-sepia' : ''} min-h-screen flex items-center justify-center bg-[var(--usb-bg-2)] text-[var(--usb-fg-hi)] p-6`}
        data-theme={theme}
      >
        <section
          className="w-full max-w-md rounded-2xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] p-6 space-y-4"
          style={{ boxShadow: isSepia ? '0 1px 2px rgba(60,40,10,.06), 0 18px 40px -16px rgba(60,40,10,.30)' : '0 1px 2px rgba(0,0,0,.10), 0 18px 44px -14px rgba(0,0,0,.65)' }}
        >
        <h1 className="text-lg font-bold tracking-tight">Permiso de red</h1>
        {origin ? (
          <>
            <p className="text-sm leading-relaxed text-[var(--usb-fg-mid)]">
              Kinema necesita tu autorización para hablar con este endpoint de IA. Chrome lo pregunta
              una sola vez y luego lo recuerda.
            </p>
            <code className="block rounded-lg bg-black/25 px-3 py-2 font-mono text-[12px] break-all text-[var(--usb-fg)]">
              {host}
            </code>
          </>
        ) : null}
          <p aria-live="polite" className="text-[13px] leading-relaxed text-[var(--usb-fg-mid)]">
            {message}
          </p>
          {state !== 'granted' && state !== 'done' && (
            <button
              type="button"
              onClick={() => void ask()}
              disabled={!origin || state === 'asking'}
              className={`${primaryBtnCls} w-full`}
            >
              {state === 'asking' ? 'Pidiendo permiso…' : 'Conceder permiso'}
            </button>
          )}
          {state === 'granted' && (
            <p className="text-[13px] font-semibold" style={{ color: okColor }}>Listo · puedes cerrar esta pestaña.</p>
          )}
        </section>
      </main>
    </>
  );
}

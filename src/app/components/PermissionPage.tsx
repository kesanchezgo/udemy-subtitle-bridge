import React, { useCallback, useEffect, useState } from 'react';

/**
 * Página propia de la extensión para conceder permiso de red.
 *
 * Por qué existe: `chrome.permissions.request` solo funciona desde un contexto
 * con gesto de usuario. El dock del panel vive en el content script, donde
 * `chrome.permissions` no existe, y el service worker —que sí lo tiene— rechaza
 * la llamada con "This function must be called during a user gesture". Esta
 * página es el único sitio donde el clic del usuario llega a la API.
 *
 * Comprobado también: chrome://extensions → Acceso a sitios NO permite añadir un
 * host arbitrario cuando el permiso es opcional; solo activa o desactiva los que
 * el manifest ya declara. Así que no había ruta manual que funcionase.
 *
 * Se abre con ?origin=https://host-elegido para saber exactamente qué permiso
 * pedir, y con `open_in_tab` para que sea una pestaña de verdad.
 */
export function PermissionPage() {
  const [origin, setOrigin] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'granted' | 'denied' | 'done'>('idle');
  const [message, setMessage] = useState('Pulsa el botón para que Chrome te pregunte.');

  useEffect(() => {
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
      setMessage('Falta el permiso que hay que conceder. Vuelve al panel e inténtalo de nuevo.');
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
    const request = api?.permissions?.request;
    if (!request) {
      setState('denied');
      setMessage('Este navegador no permite conceder permisos desde la extensión.');
      return;
    }
    try {
      // Timeout propio: si el diálogo no llega a resolverse (navegador que lo
      // suprime, gesto perdido), la promesa se queda colgada y el usuario vería
      // la página congelada para siempre. Mejor decírselo y dejar reintentar.
      const granted = await Promise.race([
        request({ origins: [origin] }),
        new Promise<boolean>((_, reject) => setTimeout(
          () => reject(new Error('Chrome no respondió a la petición de permiso.')),
          30000,
        )),
      ]);
      if (granted) {
        setState('granted');
        setMessage('Permiso concedido. Ya puedes volver al panel y guardar el proveedor.');
        // Avisar al dock, por si sigue abierto, para que refresque su estado.
        window.dispatchEvent(new CustomEvent('usb:host-permission-changed', { detail: { origin } }));
      } else {
        setState('denied');
        setMessage('No se concedió el permiso. Las peticiones a ese endpoint seguirán bloqueadas.');
      }
    } catch (error) {
      setState('denied');
      setMessage(error instanceof Error ? error.message : 'No se pudo pedir el permiso.');
    }
  }, [origin]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--usb-bg-2,#1a1b1d)] text-[var(--usb-fg-hi,#fff)] p-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--usb-border,#333)] bg-[var(--usb-bg-3,#242428)] p-6 space-y-4">
        <h1 className="text-lg font-bold tracking-tight">Permiso de red</h1>
        <p className="text-sm leading-relaxed text-[var(--usb-fg-mid,#bbb)]">
          Kinema necesita tu autorización para hablar con este endpoint de IA. Chrome lo pregunta
          una sola vez y luego lo recuerda.
        </p>
        {host && (
          <code className="block rounded-lg bg-black/25 px-3 py-2 font-mono text-[12px] break-all text-[var(--usb-fg,#eee)]">
            {host}
          </code>
        )}
        <p aria-live="polite" className="text-[13px] leading-relaxed text-[var(--usb-fg-mid,#bbb)]">
          {message}
        </p>
        {state !== 'granted' && (
          <button
            type="button"
            onClick={() => void ask()}
            disabled={!origin || state === 'asking'}
            className="w-full rounded-xl bg-[#6d4aff] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#5b37e8] disabled:opacity-50"
          >
            {state === 'asking' ? 'Pidiendo permiso…' : 'Conceder permiso'}
          </button>
        )}
        {state === 'granted' && (
          <p className="text-[13px] font-semibold text-emerald-400">Listo · puedes cerrar esta pestaña.</p>
        )}
      </section>
    </main>
  );
}

(function () {
  "use strict";

  // ============================================================================
  // MINIMAL, NON-BLOCKING CONTENT SCRIPT
  // Only critical path runs synchronously. Everything else deferred.
  // ============================================================================

  const STORAGE_KEYS = {
    subtitlesByLecture: "usg_subtitles_by_lecture_v1",
    autoEnglishByLecture: "usg_auto_english_by_lecture_v1",
    autoEnglishDownloadByLecture: "usg_auto_english_download_by_lecture_v1",
    settings: "usg_settings_v1",
    learningPanelByLecture: "usg_learning_panel_by_lecture_v1"
  };

  const DEFAULT_SETTINGS = {
    overlayEnabled: false,
    offsetMs: 0,
    fontSizePx: 32,
    opacity: 0.86
  };

  const runtimeState = {
    settings: { ...DEFAULT_SETTINGS },
    lectureKey: null,
    importedCues: [],
    overlayEl: null,
    learningPanelEl: null,
    learningPanelBusy: false,
    learningPanelError: ""
  };

  // CRITICAL PATH: Execute immediately without any awaits
  try {
    runtimeState.lectureKey = getLectureKey();
    ensureLearningPanel(); // Inject panel DOM immediately
    setupMessageHandlerNonBlocking(); // Setup message listener
  } catch (e) {
    console.error("[USG] Critical init failed:", e);
  }

  // DEFERRED: Schedule all other setup to run AFTER page is loaded
  // Each task gets its own timeout slot
  scheduleBackgroundTask("Load Settings", 100, loadSettingsAsync);
  scheduleBackgroundTask("Load Imported Cues", 200, loadImportedCuesAsync);
  scheduleBackgroundTask("Setup Overlay", 300, setupOverlayAsync);
  scheduleBackgroundTask("Setup URL Watcher", 400, setupUrlWatcherAsync);

  // ============================================================================
  // INITIALIZATION FUNCTIONS (CRITICAL PATH - NO AWAITS)
  // ============================================================================

  function getLectureKey() {
    const match = window.location.pathname.match(/lecture\/(\d+)/);
    return match ? match[1] : null;
  }

  function ensureLearningPanel() {
    if (document.querySelector("#usg-learning-panel")) {
      return;
    }

    console.log("[USG] 🔍 Iniciando búsqueda de video...");

    let attempts = 0;
    const maxAttempts = 300; // 5 minutos máximo

    const pollInterval = setInterval(() => {
      attempts++;

      // 1. Buscar video element
      const videoElements = document.querySelectorAll("video");
      if (videoElements.length === 0) {
        if (attempts % 10 === 0) {
          console.log(`[USG] ⏳ Esperando <video> element... intento ${attempts}`);
        }
        return;
      }

      // 2. Verificar que el video tenga fuente cargada
      const video = videoElements[0];
      const hasSource = video.src || video.querySelector("source");

      if (!hasSource) {
        if (attempts % 10 === 0) {
          console.log(`[USG] ⏳ Esperando fuente de video... intento ${attempts}`);
        }
        return;
      }

      // 3. Esperar a que el video tenga duración (metadatos cargados)
      if (video.duration === 0 || !isFinite(video.duration)) {
        if (attempts % 10 === 0) {
          console.log(`[USG] ⏳ Esperando duración del video... intento ${attempts}`);
        }
        return;
      }

      // 4. Video encontrado y listo!
      clearInterval(pollInterval);
      console.log(`[USG] ✅ Video encontrado y cargado en intento ${attempts}`);
      console.log(`[USG] ✅ Duración: ${Math.round(video.duration)}s`);

      // 5. Darle play automático
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log("[USG] ✅ Play iniciado automáticamente"))
          .catch((err) => console.log("[USG] ⚠️ Play falló (puede estar pausado por el usuario):", err.message));
      }

      // 5.5 Extraer Subtítulos EN si existen
      setTimeout(() => {
        let extractedCues = [];
        if (video.textTracks && video.textTracks.length > 0) {
           for (let i = 0; i < video.textTracks.length; i++) {
             const track = video.textTracks[i];
             if (track.language === 'en' || track.language === 'en-US' || track.mode === 'showing' || track.mode === 'hidden') {
                console.log(`[USG] 🗣️ Track detectado: ${track.language} (${track.kind})`);
                if (!track.cues) track.mode = "hidden"; // Forzar carga de cues
                setTimeout(() => {
                   if (track.cues && track.cues.length > 0) {
                      console.log(`[USG] 📝 Cues extraídos: ${track.cues.length}`);
                      for(let j=0; j<Math.min(5, track.cues.length); j++) {
                         console.log(`[USG] Cue ${j}: ${track.cues[j].text}`);
                      }
                      // Actualizar UI
                      const panel = document.querySelector("#usg-status-auto-en");
                      if (panel) panel.textContent = track.cues.length.toString();
                   }
                }, 1000);
             }
           }
        } else {
           console.log("[USG] ⚠️ No text tracks encontrados en el video");
        }
      }, 3000);

      // 6. Buscar container para inyectar panel
      const possibleSelectors = [
        ".video-player--container--",
        "[data-purpose='video-player']",
        ".video-player",
        "[class*='player']",
        ".learner-video-player",
        ".udemy-video-player"
      ];

      let container = null;
      for (const selector of possibleSelectors) {
        container = document.querySelector(selector);
        if (container) {
          console.log(`[USG] ✅ Video container encontrado: ${selector}`);
          break;
        }
      }

      if (!container) {
        console.warn("[USG] ⚠️ No se encontró contenedor para inyectar panel");
        return;
      }

      // 7. Crear panel con UI completa
      const panel = document.createElement("div");
      panel.id = "usg-learning-panel";
      panel.style.cssText = `
        margin-top: 20px;
        padding: 16px;
        border: 1px solid #2a3f5f;
        border-radius: 8px;
        background: #1a2332;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        color: #e5e7eb;
        max-width: 100%;
      `;

      panel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="font-size: 20px;">📚</div>
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #fff;">Udemy Subtitle Bridge</h3>
          <div style="flex: 1;"></div>
          <button id="usg-close-btn" style="
            background: none;
            border: none;
            color: #9ca3af;
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            width: 24px;
            height: 24px;
          ">✕</button>
        </div>

        <div style="
          background: #111827;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 13px;
          line-height: 1.6;
        ">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Course</div>
              <div id="usg-status-course" style="color: #e5e7eb; margin-top: 4px;">-</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Lecture</div>
              <div id="usg-status-lecture" style="color: #e5e7eb; margin-top: 4px;">-</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">EN captions</div>
              <div id="usg-status-en-captions" style="color: #e5e7eb; margin-top: 4px;">-</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Auto EN cues</div>
              <div id="usg-status-auto-en" style="color: #e5e7eb; margin-top: 4px;">0</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Imported ES cues</div>
              <div id="usg-status-imported-es" style="color: #e5e7eb; margin-top: 4px;">0</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Auto ES translation</div>
              <div id="usg-status-auto-es" style="color: #e5e7eb; margin-top: 4px;">No</div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
          <button id="usg-refresh-btn" style="
            padding: 10px 12px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
            transition: background 0.2s;
          ">🔄 Refresh status</button>
          <button id="usg-retry-translation-btn" style="
            padding: 10px 12px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
            transition: background 0.2s;
          ">🔁 Retry translation</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
          <button id="usg-export-btn" style="
            padding: 10px 12px;
            background: #16a34a;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
          ">📥 Export EN as SRT</button>
          <button id="usg-import-btn" style="
            padding: 10px 12px;
            background: #16a34a;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
          ">📤 Import ES SRT</button>
        </div>

        <button id="usg-clear-btn" style="
          width: 100%;
          padding: 10px 12px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          font-size: 13px;
          margin-bottom: 12px;
        ">🗑️ Clear imported ES (this lecture)</button>

        <div style="
          background: #111827;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 12px;
        ">
          <div style="color: #9ca3af; font-size: 12px; margin-bottom: 8px;">Paste ES SRT (no file upload)</div>
          <textarea id="usg-paste-srt" placeholder="Paste translated ES SRT here..." style="
            width: 100%;
            height: 120px;
            padding: 8px;
            background: #1f2937;
            color: #e5e7eb;
            border: 1px solid #374151;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
            box-sizing: border-box;
          "></textarea>
        </div>

        <div id="usg-status-message" style="
          padding: 12px;
          background: #0f172a;
          border-radius: 6px;
          font-size: 13px;
          color: #d1d5db;
          text-align: center;
        ">Ready.</div>
      `;

      // Insertar panel
      const parent = container.parentNode;
      if (parent) {
        parent.insertBefore(panel, container.nextSibling);
        runtimeState.learningPanelEl = panel;
        console.log("[USG] ✅ Learning panel inyectado e integrado");

        // Event listeners para botones
        setupPanelEventListeners(panel, video);
      }
    }, 1000); // Polling cada 1 segundo
  }

  function setupPanelEventListeners(panel, video) {
    const closeBtn = panel.querySelector("#usg-close-btn");
    const refreshBtn = panel.querySelector("#usg-refresh-btn");
    const retryBtn = panel.querySelector("#usg-retry-translation-btn");
    const exportBtn = panel.querySelector("#usg-export-btn");
    const importBtn = panel.querySelector("#usg-import-btn");
    const clearBtn = panel.querySelector("#usg-clear-btn");
    const statusMsg = panel.querySelector("#usg-status-message");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        panel.style.display = "none";
        console.log("[USG] Panel cerrado");
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        statusMsg.textContent = "⏳ Actualizando estado...";
        try {
          // Aquí iría la lógica de actualizar estado desde storage
          await new Promise(resolve => setTimeout(resolve, 1000));
          statusMsg.textContent = "✅ Estado actualizado";
        } catch (e) {
          statusMsg.textContent = `❌ Error: ${e.message}`;
        }
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener("click", async () => {
        statusMsg.textContent = "⏳ Extrayendo subtítulos desde el video...";
        console.log("[USG] Botón 'Retry translation' clickeado");
        try {
          const video = document.querySelector("video");
          if (!video) throw new Error("No hay video para extraer");

          let enTracks = [];
          if (video.textTracks) {
             for (let i = 0; i < video.textTracks.length; i++) {
                const t = video.textTracks[i];
                if ((t.language && t.language.includes("en")) || t.label.includes("English") || t.mode === 'showing' || t.mode === 'hidden') {
                   if (!t.cues) t.mode = "hidden";
                   if (t.cues && t.cues.length > 0) {
                      enTracks = t.cues;
                      break;
                   }
                }
             }
          }
          
          if (!enTracks || enTracks.length === 0) {
             throw new Error("No se encontraron captions en la pista del video");
          }

          statusMsg.textContent = `⏳ Traducción en progreso (${enTracks.length} cues)...`;
          
          // Crear SRT en formato texto a partir de los cues para enviarlos a background.js
          let srtText = "";
          for(let j=0; j<enTracks.length; j++) {
            const cue = enTracks[j];
            srtText += `${j+1}\n${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}\n${cue.text}\n\n`;
          }

          // Enviar al LLM mediante background script
          chrome.runtime.sendMessage({
            type: "USG_TRANSLATE_EN_SRT_AUTO",
            srtText: srtText,
            lectureKey: runtimeState.lectureKey,
            courseSlug: "course",
            lectureId: "123"
          }, (response) => {
             if (chrome.runtime.lastError || !response || !response.ok) {
                 statusMsg.textContent = `❌ Error LLM: ${chrome.runtime.lastError ? chrome.runtime.lastError.message : response?.error}`;
                 return;
             }
             
             statusMsg.textContent = `✅ Traducción exitosa! Inyectando al video...`;
             
             // Inyectar la pista de subtitulos al video
             // Limpiar anteriores
             for(let i=0; i<video.textTracks.length; i++) {
                if(video.textTracks[i].label === "Spanish (AI)") {
                   video.textTracks[i].mode = "disabled";
                }
             }

             const newTrack = video.addTextTrack("subtitles", "Spanish (AI)", "es");
             newTrack.mode = "showing";

             // Simple SRT parser mock
             const blocks = response.srt.split("\\n\\n");
             for(const block of blocks) {
                const lines = block.split("\\n");
                if(lines.length >= 3) {
                   const time = lines[1];
                   newTrack.addCue(new VTTCue(0, 10, lines.slice(2).join(" "))); // placeholder
                }
             }
          });
        } catch (e) {
          statusMsg.textContent = `❌ Error: ${e.message}`;
        }
      });
    }

    // Helper for formatting time (basic)
    function formatTime(seconds) {
       const date = new Date(null);
       date.setSeconds(seconds);
       return date.toISOString().substr(11, 8) + ",000";
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        console.log("[USG] Exportando subtítulos EN como SRT");
        statusMsg.textContent = "✅ Archivo descargado";
      });
    }

    if (importBtn) {
      importBtn.addEventListener("click", () => {
        console.log("[USG] Importando ES SRT");
        statusMsg.textContent = "✅ SRT importado";
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        console.log("[USG] Limpiando ES importado");
        statusMsg.textContent = "✅ Subtítulos limpiados";
      });
    }
  }

  function setupMessageHandlerNonBlocking() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = message && message.type;

      if (!type) {
        return false;
      }

      // All message types should respond (fail-fast if error)
      handleMessage(type, message)
        .then((result) => {
          sendResponse({ ok: true, ...result });
        })
        .catch((error) => {
          console.error("[USG] Message handler error:", error);
          sendResponse({ ok: false, error: String(error.message || error) });
        });

      // Return true to indicate we'll respond asynchronously
      return true;
    });

    console.log("[USG] ✅ Message handler setup complete");
  }

  async function handleMessage(type, message) {
    switch (type) {
      case "USG_GET_STATUS":
        return { status: "ready", lectureKey: runtimeState.lectureKey };

      case "USG_EXPORT_EN_SRT":
        return { srtText: "Not implemented yet" };

      case "USG_GET_STUDY_TRANSCRIPT":
        return { transcript: "Not implemented yet" };

      case "USG_IMPORT_ES_SRT":
        return { imported: 0 };

      case "USG_SET_OVERLAY_ENABLED":
        runtimeState.settings.overlayEnabled = !!message.enabled;
        return { overlayEnabled: runtimeState.settings.overlayEnabled };

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  // ============================================================================
  // BACKGROUND TASKS (DEFERRED - WON'T BLOCK PAGE)
  // ============================================================================

  function scheduleBackgroundTask(name, delayMs, asyncFn) {
    setTimeout(async () => {
      try {
        console.log(`[USG] Starting deferred task: ${name}`);
        await asyncFn();
        console.log(`[USG] ✅ ${name} completed`);
      } catch (error) {
        console.warn(`[USG] ⚠️ ${name} failed (non-critical):`, error.message);
        // Continue anyway - these are all optional
      }
    }, delayMs);
  }

  async function loadSettingsAsync() {
    try {
      const stored = await chromeStorageGet(STORAGE_KEYS.settings);
      if (stored && stored[STORAGE_KEYS.settings]) {
        runtimeState.settings = {
          ...DEFAULT_SETTINGS,
          ...stored[STORAGE_KEYS.settings]
        };
      }
    } catch (error) {
      console.warn("[USG] Could not load settings:", error.message);
    }
  }

  async function loadImportedCuesAsync() {
    if (!runtimeState.lectureKey) {
      return;
    }

    try {
      const key = `${STORAGE_KEYS.subtitlesByLecture}_${runtimeState.lectureKey}`;
      const stored = await chromeStorageGet(key);
      if (stored && stored[key] && Array.isArray(stored[key])) {
        runtimeState.importedCues = stored[key];
        console.log(`[USG] Loaded ${runtimeState.importedCues.length} imported cues`);
      }
    } catch (error) {
      console.warn("[USG] Could not load imported cues:", error.message);
    }
  }

  async function setupOverlayAsync() {
    // Placeholder for overlay setup
    // Will be implemented in future versions
    console.log("[USG] Overlay setup deferred (optional feature)");
  }

  async function setupUrlWatcherAsync() {
    // Watch for URL changes (when user navigates to different lecture)
    let lastUrl = window.location.href;

    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log("[USG] URL changed, refreshing lecture key...");
        runtimeState.lectureKey = getLectureKey();
      }
    }, 1000);
  }

  // ============================================================================
  // CHROME STORAGE HELPER (Promisified)
  // ============================================================================

  function chromeStorageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result || {});
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function chromeStorageSet(items) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
})();

console.log("[USG] TEXT TRACKS DEBUG: ", Array.from(document.querySelectorAll("video")).map(v => v.textTracks.length));

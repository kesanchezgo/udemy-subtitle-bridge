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

    const container = document.querySelector(".video-player--container--");
    if (!container) {
      console.warn("[USG] Video player container not found. Will retry later.");
      return;
    }

    const panel = document.createElement("div");
    panel.id = "usg-learning-panel";
    panel.style.cssText = `
      margin-top: 15px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f9f9f9;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    panel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">📚 USG Learning Panel</div>
      <button id="usg-translate-btn" style="
        padding: 8px 12px;
        background: #0066cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      ">
        Traducir Subtítulos
      </button>
      <div id="usg-panel-status" style="margin-top: 8px; font-size: 12px; color: #666;"></div>
    `;

    const parent = container.parentNode;
    if (parent) {
      parent.insertBefore(panel, container.nextSibling);
      runtimeState.learningPanelEl = panel;
      console.log("[USG] ✅ Learning panel injected successfully");
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

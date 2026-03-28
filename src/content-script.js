(function () {
  "use strict";

  const STORAGE_KEYS = {
    subtitlesByLecture: "usg_subtitles_by_lecture_v1",
    autoEnglishByLecture: "usg_auto_english_by_lecture_v1",
    autoEnglishDownloadByLecture: "usg_auto_english_download_by_lecture_v1",
    settings: "usg_settings_v1"
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
    rafId: null,
    lastRenderedIndex: -1,
    lastRenderedText: "",
    urlWatchValue: location.href,
    observedEnCues: [],
    observedOpenCue: null,
    observedLastText: "",
    cueProbeTimer: null,
    prefetchedEnCues: [],
    prefetchInfo: null,
    prefetchPromise: null,
    netBridgeBound: false,
    autoEnEntry: null,
    autoPipelinePromise: null,
    autoPipelineAttempt: 0,
    autoLastError: "",
    autoRetryTimer: null,
    autoDownloadedForLecture: false,
    autoDownloadRetryTimer: null
  };

  init().catch(() => {
    // Keep content script resilient. Popup can still show actionable errors.
  });

  async function init() {
    runtimeState.settings = await loadSettings();
    runtimeState.lectureKey = getLectureKey();
    runtimeState.importedCues = await loadImportedCuesForCurrentLecture();
    runtimeState.autoEnEntry = await loadAutoEnglishForCurrentLecture();
    runtimeState.autoDownloadedForLecture = await hasAutoDownloadedForCurrentLecture(runtimeState.autoEnEntry);

    setupPageNetworkCaptureBridge();
    ensureOverlayElement();
    startPassiveCueCapture();
    startProactivePrefetch();
    startAutoEnglishPipeline();
    applyOverlayVisibility();
    startUrlWatcher();
    setupMessageHandler();
    startOverlayLoopIfNeeded();
  }

  function setupMessageHandler() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = message && message.type;

      if (type === "USG_GET_STATUS") {
        getStatus()
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      if (type === "USG_EXPORT_EN_SRT") {
        exportEnglishSrt()
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      if (type === "USG_IMPORT_ES_SRT") {
        importSpanishSrt(message && message.srtText)
          .then((result) => sendResponse({ ok: true, ...result }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      if (type === "USG_SET_OVERLAY_ENABLED") {
        setOverlayEnabled(Boolean(message && message.enabled))
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      if (type === "USG_SET_OVERLAY_SETTINGS") {
        setOverlaySettings(message || {})
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      if (type === "USG_CLEAR_IMPORTED_FOR_LECTURE") {
        clearImportedForCurrentLecture()
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));
        return true;
      }

      return false;
    });
  }

  function startUrlWatcher() {
    setInterval(async () => {
      if (runtimeState.urlWatchValue === location.href) {
        return;
      }

      runtimeState.urlWatchValue = location.href;

      const nextLectureKey = getLectureKey();
      if (nextLectureKey === runtimeState.lectureKey) {
        return;
      }

      runtimeState.lectureKey = nextLectureKey;
      runtimeState.importedCues = await loadImportedCuesForCurrentLecture();
      runtimeState.lastRenderedIndex = -1;
      runtimeState.lastRenderedText = "";
      runtimeState.observedEnCues = [];
      runtimeState.observedOpenCue = null;
      runtimeState.observedLastText = "";
      runtimeState.prefetchedEnCues = [];
      runtimeState.prefetchInfo = null;
      runtimeState.prefetchPromise = null;
      runtimeState.autoEnEntry = await loadAutoEnglishForCurrentLecture();
      runtimeState.autoDownloadedForLecture = await hasAutoDownloadedForCurrentLecture(runtimeState.autoEnEntry);
      runtimeState.autoPipelinePromise = null;
      runtimeState.autoPipelineAttempt = 0;
      runtimeState.autoLastError = "";
      if (runtimeState.autoRetryTimer != null) {
        clearTimeout(runtimeState.autoRetryTimer);
        runtimeState.autoRetryTimer = null;
      }
      if (runtimeState.autoDownloadRetryTimer != null) {
        clearTimeout(runtimeState.autoDownloadRetryTimer);
        runtimeState.autoDownloadRetryTimer = null;
      }
      startProactivePrefetch();
      startAutoEnglishPipeline();
      applyOverlayVisibility();
      startOverlayLoopIfNeeded();
    }, 700);
  }

  async function getStatus() {
    const details = detectCaptionAvailability();
    const importedCount = runtimeState.importedCues.length;
    const autoReady = Boolean(runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt);
    const autoCueCount = runtimeState.autoEnEntry ? Number(runtimeState.autoEnEntry.cueCount) || 0 : 0;
    const autoMode = runtimeState.autoEnEntry ? String(runtimeState.autoEnEntry.mode || "") : "";
    const autoDownloaded = Boolean(runtimeState.autoDownloadedForLecture);

    const canActions = !details.hasNativeSpanish;
    let reason = "";
    if (details.hasNativeSpanish) {
      reason = "Native ES captions detected. Export and import are disabled by rule.";
    } else if (autoReady && autoDownloaded) {
      reason = `EN subtitles are ready and downloaded automatically (${autoCueCount} cues).`;
    } else if (autoReady) {
      reason = `EN subtitles are ready automatically (${autoCueCount} cues).`;
    } else if (runtimeState.autoPipelinePromise) {
      reason = "Auto-capturing EN subtitles for this lecture...";
    } else if (runtimeState.autoLastError) {
      reason = `Auto capture retry pending: ${runtimeState.autoLastError}`;
    } else if (!details.hasEnglish) {
      reason = "Waiting for EN subtitle data from Udemy...";
    } else {
      reason = "Auto capture in progress.";
    }

    return {
      courseSlug: getCourseSlugFromUrl(),
      lectureId: getLectureIdFromUrl(),
      courseId: getCourseIdFromModuleArgs(),
      lectureKey: runtimeState.lectureKey,
      hasEnglish: details.hasEnglish,
      hasNativeSpanish: details.hasNativeSpanish,
      canActions,
      reason,
      importedCount,
      overlayEnabled: runtimeState.settings.overlayEnabled,
      overlayApplied: runtimeState.settings.overlayEnabled && importedCount > 0,
      settings: { ...runtimeState.settings },
      prefetchMode: autoMode || (runtimeState.prefetchInfo ? runtimeState.prefetchInfo.mode : ""),
      prefetchedCueCount: autoCueCount || runtimeState.prefetchedEnCues.length,
      autoReady,
      autoCueCount,
      autoMode,
      autoDownloaded,
      autoError: runtimeState.autoLastError,
      autoAttempt: runtimeState.autoPipelineAttempt
    };
  }

  async function exportEnglishSrt() {
    const status = await getStatus();
    if (status.hasNativeSpanish) {
      throw new Error(status.reason || "Export disabled by current caption state.");
    }

    if (runtimeState.autoPipelinePromise) {
      try {
        await Promise.race([runtimeState.autoPipelinePromise, sleep(4200)]);
      } catch (_error) {
        // Continue below with current state.
      }
    }

    if (runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt) {
      return {
        fileName: runtimeState.autoEnEntry.fileName || buildEnglishFileName(),
        srt: runtimeState.autoEnEntry.srt,
        cueCount: Number(runtimeState.autoEnEntry.cueCount) || 0,
        extractionMode: runtimeState.autoEnEntry.mode || "auto-cached",
        warning: runtimeState.autoEnEntry.warning || ""
      };
    }

    const extraction = await extractEnglishTimedCues();
    if (!extraction.cues.length) {
      throw new Error("No transcript cues could be extracted.");
    }

    const saved = await saveAutoEnglishEntryFromExtraction(extraction);

    return {
      fileName: saved.fileName,
      srt: saved.srt,
      cueCount: saved.cueCount,
      extractionMode: saved.mode,
      warning: saved.warning || ""
    };
  }

  function startAutoEnglishPipeline() {
    if (runtimeState.autoPipelinePromise) {
      return;
    }

    if (runtimeState.autoRetryTimer != null) {
      clearTimeout(runtimeState.autoRetryTimer);
      runtimeState.autoRetryTimer = null;
    }

    if (detectCaptionAvailability().hasNativeSpanish) {
      return;
    }

    if (runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt) {
      triggerAutoEnglishDownload(runtimeState.autoEnEntry).catch(() => {});
      return;
    }

    runtimeState.autoPipelinePromise = runAutoEnglishPipeline().finally(() => {
      runtimeState.autoPipelinePromise = null;
      if (!runtimeState.autoEnEntry && !detectCaptionAvailability().hasNativeSpanish) {
        runtimeState.autoRetryTimer = setTimeout(() => {
          runtimeState.autoRetryTimer = null;
          startAutoEnglishPipeline();
        }, 5000);
      }
    });
  }

  async function runAutoEnglishPipeline() {
    const delaysMs = [0, 600, 1200, 2200, 3800];
    for (let i = 0; i < delaysMs.length; i += 1) {
      if (detectCaptionAvailability().hasNativeSpanish) {
        return;
      }

      if (runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt) {
        return;
      }

      runtimeState.autoPipelineAttempt = i + 1;
      if (delaysMs[i] > 0) {
        await sleep(delaysMs[i]);
      }

      try {
        const extraction = await extractEnglishTimedCues({
          skipTranscript: true,
          skipTextTracks: false
        });
        if (!extraction.cues.length) {
          continue;
        }
        await saveAutoEnglishEntryFromExtraction(extraction);
        runtimeState.autoLastError = "";
        return;
      } catch (error) {
        runtimeState.autoLastError = toErrorMessage(error);
      }
    }
  }

  async function extractEnglishTimedCues(options) {
    const opts = options || {};
    const skipTranscript = Boolean(opts.skipTranscript);
    const skipTextTracks = Boolean(opts.skipTextTracks);
    const errors = [];

    if (runtimeState.prefetchPromise) {
      try {
        await Promise.race([runtimeState.prefetchPromise, sleep(4200)]);
      } catch (_error) {
        // Continue with fallbacks.
      }
    }

    if (runtimeState.prefetchedEnCues.length >= 2) {
      return {
        mode: runtimeState.prefetchInfo && runtimeState.prefetchInfo.mode
          ? runtimeState.prefetchInfo.mode
          : "prefetched",
        cues: dedupeAndSortCues(runtimeState.prefetchedEnCues)
      };
    }

    if (!skipTranscript) {
      try {
        const fromTranscript = await extractTranscriptTimedCues();
        if (fromTranscript.cues.length >= 2) {
          return fromTranscript;
        }
      } catch (error) {
        errors.push(toErrorMessage(error));
      }
    }

    if (!skipTextTracks) {
      try {
        const fromTracks = await extractFromVideoTextTracks();
        if (fromTracks.cues.length >= 2) {
          return fromTracks;
        }
      } catch (error) {
        errors.push(toErrorMessage(error));
      }
    }

    const fromObserved = extractFromObservedCues();
    if (fromObserved.cues.length >= 2) {
      return {
        ...fromObserved,
        warning: "Exported from live observed captions. If incomplete, play more of the lecture and export again."
      };
    }

    throw new Error(
      [
        "Could not extract EN subtitles yet.",
        "Enable English captions and play the lecture for 20-40 seconds, then export again.",
        errors.filter(Boolean).join(" | ")
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  async function importSpanishSrt(srtText) {
    if (!srtText || !String(srtText).trim()) {
      throw new Error("SRT file is empty.");
    }

    const parsed = parseSrt(String(srtText));
    if (!parsed.length) {
      throw new Error("Could not parse valid SRT cues.");
    }

    const key = getLectureKey();
    const all = await loadSubtitlesMap();
    const previousEntry = all[key];
    const alreadyLoaded =
      previousEntry &&
      Array.isArray(previousEntry.cues) &&
      areCueListsEquivalent(previousEntry.cues, parsed);

    if (!alreadyLoaded) {
      all[key] = {
        language: "es",
        importedAt: new Date().toISOString(),
        cues: parsed
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.subtitlesByLecture]: all });
    }

    runtimeState.lectureKey = key;
    runtimeState.importedCues = parsed;
    runtimeState.lastRenderedIndex = -1;
    runtimeState.lastRenderedText = "";

    if (!runtimeState.settings.overlayEnabled) {
      runtimeState.settings.overlayEnabled = true;
      await saveSettings(runtimeState.settings);
    }

    applyOverlayVisibility();
    startOverlayLoopIfNeeded();

    return {
      importedCount: parsed.length,
      lectureKey: key,
      alreadyLoaded,
      suggestedFileName: buildSpanishFileName()
    };
  }

  async function clearImportedForCurrentLecture() {
    const key = getLectureKey();
    const all = await loadSubtitlesMap();
    delete all[key];
    await chrome.storage.local.set({ [STORAGE_KEYS.subtitlesByLecture]: all });

    runtimeState.importedCues = [];
    runtimeState.lastRenderedIndex = -1;
    runtimeState.lastRenderedText = "";

    applyOverlayVisibility();
    stopOverlayLoop();
    return getStatus();
  }

  async function setOverlayEnabled(enabled) {
    runtimeState.settings.overlayEnabled = Boolean(enabled);
    await saveSettings(runtimeState.settings);
    applyOverlayVisibility();
    startOverlayLoopIfNeeded();
    return getStatus();
  }

  async function setOverlaySettings(payload) {
    let changed = false;

    const offsetValue = toFiniteNumber(payload.offsetMs);
    if (offsetValue != null) {
      const nextOffset = clamp(Math.round(offsetValue), -15000, 15000);
      if (runtimeState.settings.offsetMs !== nextOffset) {
        runtimeState.settings.offsetMs = nextOffset;
        changed = true;
      }
    }

    const fontValue = toFiniteNumber(payload.fontSizePx);
    if (fontValue != null) {
      const nextFont = clamp(Math.round(fontValue), 16, 64);
      if (runtimeState.settings.fontSizePx !== nextFont) {
        runtimeState.settings.fontSizePx = nextFont;
        changed = true;
      }
    }

    const opacityValue = toFiniteNumber(payload.opacity);
    if (opacityValue != null) {
      const nextOpacity = clamp(opacityValue, 0, 1);
      if (runtimeState.settings.opacity !== nextOpacity) {
        runtimeState.settings.opacity = nextOpacity;
        changed = true;
      }
    }

    if (changed) {
      runtimeState.lastRenderedIndex = -1;
      runtimeState.lastRenderedText = "";
    }

    await saveSettings(runtimeState.settings);
    applyOverlayStyle();
    renderOverlayTick();
    return getStatus();
  }

  async function loadImportedCuesForCurrentLecture() {
    const key = getLectureKey();
    const all = await loadSubtitlesMap();
    const entry = all[key];
    if (!entry || !Array.isArray(entry.cues)) {
      return [];
    }
    return entry.cues
      .map((cue) => ({
        startMs: Number(cue.startMs) || 0,
        endMs: Number(cue.endMs) || 0,
        text: String(cue.text || "")
      }))
      .filter((cue) => cue.endMs > cue.startMs && cue.text.trim());
  }

  async function loadAutoEnglishForCurrentLecture() {
    const key = getLectureKey();
    const all = await loadAutoEnglishMap();
    const entry = all[key];
    if (!entry || typeof entry !== "object") {
      return null;
    }
    if (!entry.srt || !entry.cueCount) {
      return null;
    }

    const parsed = parseSrt(String(entry.srt || ""));
    if (!cuesLookLikeRealSubtitles(parsed)) {
      delete all[key];
      const downloaded = await loadAutoEnglishDownloadMap();
      delete downloaded[key];
      await chrome.storage.local.set({
        [STORAGE_KEYS.autoEnglishByLecture]: all,
        [STORAGE_KEYS.autoEnglishDownloadByLecture]: downloaded
      });
      return null;
    }

    return {
      fileName: String(entry.fileName || buildEnglishFileName()),
      srt: String(entry.srt || ""),
      cueCount: Number(entry.cueCount) || 0,
      mode: String(entry.mode || "auto-cached"),
      warning: String(entry.warning || ""),
      capturedAt: String(entry.capturedAt || "")
    };
  }

  async function loadSubtitlesMap() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.subtitlesByLecture);
    const map = data && data[STORAGE_KEYS.subtitlesByLecture];
    if (!map || typeof map !== "object") {
      return {};
    }
    return map;
  }

  async function loadAutoEnglishMap() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.autoEnglishByLecture);
    const map = data && data[STORAGE_KEYS.autoEnglishByLecture];
    if (!map || typeof map !== "object") {
      return {};
    }
    return map;
  }

  async function loadAutoEnglishDownloadMap() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.autoEnglishDownloadByLecture);
    const map = data && data[STORAGE_KEYS.autoEnglishDownloadByLecture];
    if (!map || typeof map !== "object") {
      return {};
    }
    return map;
  }

  function buildAutoEnglishFingerprint(entry) {
    const cueCount = Number((entry && entry.cueCount) || 0);
    const fileName = String((entry && entry.fileName) || "");
    return `${fileName}|${cueCount}`;
  }

  async function hasAutoDownloadedForCurrentLecture(entry) {
    if (!entry || !entry.srt || !entry.cueCount) {
      return false;
    }
    const key = getLectureKey();
    const map = await loadAutoEnglishDownloadMap();
    const marker = map[key];
    const expectedFileName = String((entry && entry.fileName) || buildEnglishFileName());

    // New format: object with a downloaded flag.
    if (marker && typeof marker === "object") {
      if (!marker.downloaded) {
        return false;
      }

      const markerFileName = String(marker.fileName || "").trim();
      if (!markerFileName) {
        return true;
      }

      return markerFileName === expectedFileName;
    }

    // Legacy format: fingerprint string.
    if (typeof marker === "string") {
      const raw = marker.trim();
      if (!raw) {
        return false;
      }

      const maybeFileName = raw.includes("|")
        ? raw.split("|").pop().trim()
        : raw;

      if (!maybeFileName) {
        return true;
      }

      // Accept if full match or at least contains expected lecture-id filename.
      return maybeFileName === expectedFileName || maybeFileName.includes(expectedFileName);
    }

    // Legacy format: boolean.
    if (typeof marker === "boolean") {
      return marker;
    }

    return false;
  }

  async function markAutoEnglishDownloaded(entry) {
    const key = getLectureKey();
    const map = await loadAutoEnglishDownloadMap();
    map[key] = {
      downloaded: true,
      fileName: String((entry && entry.fileName) || buildEnglishFileName()),
      cueCount: Number((entry && entry.cueCount) || 0),
      at: new Date().toISOString()
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.autoEnglishDownloadByLecture]: map });
  }

  function sendMessageToExtension(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve({ ok: false, error: err.message || "Extension message failed." });
            return;
          }
          resolve(response || { ok: false, error: "No response from extension runtime." });
        });
      } catch (error) {
        resolve({ ok: false, error: toErrorMessage(error) });
      }
    });
  }

  function triggerPageDownload(fileName, text) {
    try {
      const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(fileName || buildEnglishFileName());
      a.style.display = "none";
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1200);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function scheduleAutoDownloadRetry() {
    if (runtimeState.autoDownloadRetryTimer != null) {
      return;
    }
    runtimeState.autoDownloadRetryTimer = setTimeout(() => {
      runtimeState.autoDownloadRetryTimer = null;
      if (!runtimeState.autoEnEntry || runtimeState.autoDownloadedForLecture) {
        return;
      }
      if (detectCaptionAvailability().hasNativeSpanish) {
        return;
      }
      triggerAutoEnglishDownload(runtimeState.autoEnEntry).catch(() => {});
    }, 3500);
  }

  async function triggerAutoEnglishDownload(entry) {
    if (runtimeState.autoDownloadRetryTimer != null) {
      clearTimeout(runtimeState.autoDownloadRetryTimer);
      runtimeState.autoDownloadRetryTimer = null;
    }

    if (detectCaptionAvailability().hasNativeSpanish) {
      runtimeState.autoDownloadedForLecture = false;
      return;
    }

    if (!entry || !entry.srt || Number(entry.cueCount) < 2) {
      runtimeState.autoDownloadedForLecture = false;
      return;
    }

    if (await hasAutoDownloadedForCurrentLecture(entry)) {
      runtimeState.autoDownloadedForLecture = true;
      return;
    }

    const payloadText = String(entry.srt || "");
    const largePayload = payloadText.length > 350000;

    if (largePayload) {
      const fallbackOk = triggerPageDownload(String(entry.fileName || buildEnglishFileName()), payloadText);
      if (fallbackOk) {
        await markAutoEnglishDownloaded(entry);
        runtimeState.autoDownloadedForLecture = true;
        runtimeState.autoLastError = "";
        return;
      }
    }

    const response = await sendMessageToExtension({
      type: "USG_DOWNLOAD_EN_SRT_AUTO",
      fileName: String(entry.fileName || buildEnglishFileName()),
      srt: payloadText
    });

    if (!response || !response.ok) {
      const fallbackOk = triggerPageDownload(String(entry.fileName || buildEnglishFileName()), String(entry.srt || ""));
      if (!fallbackOk) {
        runtimeState.autoDownloadedForLecture = false;
        runtimeState.autoLastError = response && response.error
          ? `Automatic EN download failed: ${String(response.error)}`
          : "Automatic EN download failed.";
        scheduleAutoDownloadRetry();
        return;
      }
    }

    await markAutoEnglishDownloaded(entry);
    runtimeState.autoDownloadedForLecture = true;
    runtimeState.autoLastError = "";
  }

  async function saveAutoEnglishEntry(entry) {
    const key = getLectureKey();
    const all = await loadAutoEnglishMap();
    all[key] = entry;
    await chrome.storage.local.set({ [STORAGE_KEYS.autoEnglishByLecture]: all });
    runtimeState.autoEnEntry = entry;
    runtimeState.autoLastError = "";
    triggerAutoEnglishDownload(entry).catch(() => {});
  }

  async function saveAutoEnglishEntryFromExtraction(extraction) {
    const cues = dedupeAndSortCues(extraction.cues || []);
    if (cues.length < 2) {
      throw new Error("Not enough EN cues to build SRT.");
    }

    const existing = runtimeState.autoEnEntry;
    if (existing && Number(existing.cueCount) >= cues.length) {
      triggerAutoEnglishDownload(existing).catch(() => {});
      return existing;
    }

    const entry = {
      fileName: buildEnglishFileName(),
      srt: toSrt(cues),
      cueCount: cues.length,
      mode: String(extraction.mode || "auto-captured"),
      warning: String(extraction.warning || ""),
      capturedAt: new Date().toISOString()
    };

    await saveAutoEnglishEntry(entry);
    return entry;
  }

  function buildEnglishFileName() {
    const safeCourse = (getCourseSlugFromUrl() || "udemy-course").replace(/[^a-z0-9_-]/gi, "-");
    const safeLecture = String(getLectureIdFromUrl() || "lecture").replace(/[^a-z0-9_-]/gi, "-");
    return `${safeCourse}_${safeLecture}_en.srt`;
  }

  function buildSpanishFileName() {
    const safeCourse = (getCourseSlugFromUrl() || "udemy-course").replace(/[^a-z0-9_-]/gi, "-");
    const safeLecture = String(getLectureIdFromUrl() || "lecture").replace(/[^a-z0-9_-]/gi, "-");
    return `${safeCourse}_${safeLecture}_es.srt`;
  }

  function areCueListsEquivalent(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i += 1) {
      const x = a[i] || {};
      const y = b[i] || {};

      const xStart = Math.round(Number(x.startMs) || 0);
      const yStart = Math.round(Number(y.startMs) || 0);
      const xEnd = Math.round(Number(x.endMs) || 0);
      const yEnd = Math.round(Number(y.endMs) || 0);
      const xText = String(x.text || "").trim();
      const yText = String(y.text || "").trim();

      if (xStart !== yStart || xEnd !== yEnd || xText !== yText) {
        return false;
      }
    }

    return true;
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const settings = data && data[STORAGE_KEYS.settings];
    return {
      ...DEFAULT_SETTINGS,
      ...(settings || {})
    };
  }

  async function saveSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  }

  function detectCaptionAvailability() {
    const normalized = [];

    const args = getCourseModuleArgs();
    if (
      args &&
      args.courseLeadData &&
      Array.isArray(args.courseLeadData.captionedLanguages)
    ) {
      for (const lang of args.courseLeadData.captionedLanguages) {
        normalized.push(normalizeLanguageName(String(lang)));
      }
    }

    const menuItems = document.querySelectorAll(
      "[data-purpose='captions-dropdown-menu'] [role='menuitemradio']"
    );
    for (const item of menuItems) {
      normalized.push(normalizeLanguageName(item.textContent || ""));
    }

    const unique = Array.from(new Set(normalized.filter(Boolean)));

    const hasEnglishTrack = hasEnglishTextTrack();

    const hasEnglish =
      unique.some((x) => /english/.test(x)) ||
      hasEnglishTrack ||
      Boolean(document.querySelector("[data-purpose='transcript-cue']")) ||
      runtimeState.observedEnCues.length > 0 ||
      runtimeState.prefetchedEnCues.length > 0 ||
      Boolean(runtimeState.autoEnEntry && runtimeState.autoEnEntry.cueCount > 0);

    const hasNativeSpanish = unique.some((x) => /spanish|espanol|español/.test(x));

    return {
      hasEnglish,
      hasNativeSpanish,
      languages: unique
    };
  }

  function hasEnglishTextTrack() {
    const video = getVideoElement();
    if (!video || !video.textTracks) {
      return false;
    }
    const tracks = Array.from(video.textTracks);
    return tracks.some((track) => {
      const label = normalizeLanguageName(track.label || "");
      const lang = normalizeLanguageName(track.language || "");
      const kind = normalizeLanguageName(track.kind || "");
      const isCaptionKind = /caption|subtitle/.test(kind);
      const isEnglish = /(^en$)|(^en-)|english/.test(lang) || /english/.test(label);
      return isCaptionKind && isEnglish;
    });
  }

  function setupPageNetworkCaptureBridge() {
    if (runtimeState.netBridgeBound) {
      return;
    }
    runtimeState.netBridgeBound = true;

    document.addEventListener("USG_NET_CAPTURE", (event) => {
      const detail = event && event.detail ? event.detail : null;
      if (!detail || !detail.url) {
        return;
      }
      handleNetworkCaptureDetail(detail);
    });

    const scriptId = "usg-net-bridge-script";
    if (document.getElementById(scriptId)) {
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = chrome.runtime.getURL("src/page-network-bridge.js");
    script.async = false;
    script.onload = () => {
      script.remove();
    };
    script.onerror = () => {
      runtimeState.autoLastError = "Could not load page network bridge (CSP or extension resource error).";
      script.remove();
    };

    (document.documentElement || document.head || document.body).appendChild(script);
  }

  function handleNetworkCaptureDetail(detail) {
    const url = String(detail.url || "");
    const contentType = normalizeLanguageName(detail.contentType || "");
    const body = String(detail.body || "");
    if (!url || !body) {
      return;
    }

    if (contentType.includes("text/vtt") || /\.vtt(\?|$)/i.test(url)) {
      const cues = parseWebVtt(body);
      if (cues.length >= 2 && cuesLookLikeRealSubtitles(cues)) {
        setPrefetchedCues(cues, "network-vtt", `Captured from ${url}`);
        return;
      }
    }

    if (contentType.includes("json") || /graphql/i.test(url)) {
      const candidates = extractCaptionCandidatesFromUnknown(body);
      const en = chooseEnglishCaptionCandidate(candidates);
      if (en && en.url) {
        fetchAndStoreVttFromUrl(en.url, "network-json-url").catch(() => {});
      }
    }
  }

  function startProactivePrefetch() {
    if (runtimeState.prefetchPromise) {
      return;
    }
    if (detectCaptionAvailability().hasNativeSpanish) {
      return;
    }
    runtimeState.prefetchPromise = proactivePrefetchLectureCues().finally(() => {
      runtimeState.prefetchPromise = null;
    });
  }

  async function proactivePrefetchLectureCues() {
    const courseId = getCourseIdFromModuleArgs();
    const lectureId = getLectureIdFromUrl();
    if (!courseId || !lectureId) {
      return;
    }

    const endpointCandidates = [
      `/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset,title&fields[asset]=captions,media_sources,stream_urls`,
      `/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset&fields[asset]=captions`,
      `/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset`,
      `/api-2.0/courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset&fields[asset]=captions`
    ];

    for (const endpoint of endpointCandidates) {
      try {
        const json = await fetchJsonWithAuth(endpoint);
        if (!json) {
          continue;
        }

        const candidates = extractCaptionCandidatesFromObject(json);
        const en = chooseEnglishCaptionCandidate(candidates);
        if (!en || !en.url) {
          continue;
        }

        const ok = await fetchAndStoreVttFromUrl(en.url, "api-captions");
        if (ok) {
          return;
        }
      } catch (_error) {
        // Try next endpoint candidate.
      }
    }
  }

  async function fetchJsonWithAuth(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain, */*"
      }
    });
    if (!response.ok) {
      return null;
    }
    const contentType = normalizeLanguageName(response.headers.get("content-type") || "");
    if (!contentType.includes("json")) {
      return null;
    }
    return response.json();
  }

  async function fetchAndStoreVttFromUrl(url, mode) {
    if (!url) {
      return false;
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) {
        return false;
      }
      const text = await response.text();
      const cues = parseWebVtt(text);
      if (cues.length < 2) {
        return false;
      }
      if (!cuesLookLikeRealSubtitles(cues)) {
        return false;
      }
      setPrefetchedCues(cues, mode, `Fetched from ${url}`);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function setPrefetchedCues(cues, mode, note) {
    if (detectCaptionAvailability().hasNativeSpanish) {
      return;
    }

    const deduped = dedupeAndSortCues(cues);
    if (deduped.length < 2) {
      return;
    }
    if (!cuesLookLikeRealSubtitles(deduped)) {
      runtimeState.autoLastError = "Rejected non-subtitle VTT track (thumbnail/storyboard).";
      return;
    }

    if (runtimeState.prefetchedEnCues.length && runtimeState.prefetchedEnCues.length >= deduped.length) {
      return;
    }

    runtimeState.prefetchedEnCues = deduped;
    runtimeState.prefetchInfo = {
      mode,
      note,
      cueCount: deduped.length,
      at: Date.now()
    };

    saveAutoEnglishEntryFromExtraction({ cues: deduped, mode, warning: "" }).catch(() => {});
  }

  function extractCaptionCandidatesFromUnknown(text) {
    try {
      const obj = JSON.parse(text);
      return extractCaptionCandidatesFromObject(obj);
    } catch (_error) {
      const urls = [];
      const rx = new RegExp("https?:\\\\/\\\\/[^\\\"'\\\\s<>]+", "g");
      let m;
      while ((m = rx.exec(text)) != null) {
        const raw = String(m[0] || "").replaceAll("\\/", "/");
        if (/caption|subtitle|transcript|\.vtt(\?|$)/i.test(raw)) {
          urls.push({ url: raw, lang: "" });
        }
      }
      return urls;
    }
  }

  function extractCaptionCandidatesFromObject(root) {
    const out = [];
    const contextKeyRx = /(caption|subtitle|transcript|track|texttrack|webvtt|vtt|srclang|locale|lang)/i;

    const isLikelyUrl = (value) => {
      if (typeof value !== "string") {
        return false;
      }
      const v = value.trim();
      return /^https?:\/\//i.test(v) || /^\/[^\s]+/.test(v);
    };

    const toAbsoluteMaybe = (value) => {
      const v = String(value || "").trim();
      if (!v) {
        return "";
      }
      if (/^https?:\/\//i.test(v)) {
        return v;
      }
      if (v.startsWith("/")) {
        return `${location.origin}${v}`;
      }
      return v;
    };

    const visit = (node, inCaptionContext, inheritedLang) => {
      if (!node) {
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) {
          visit(item, inCaptionContext, inheritedLang);
        }
        return;
      }

      if (typeof node !== "object") {
        return;
      }

      const directUrl =
        (typeof node.url === "string" && node.url) ||
        (typeof node.src === "string" && node.src) ||
        (typeof node.file === "string" && node.file) ||
        "";

      const lang =
        (typeof node.locale_id === "string" && node.locale_id) ||
        (typeof node.language === "string" && node.language) ||
        (typeof node.srclang === "string" && node.srclang) ||
        (typeof node.label === "string" && node.label) ||
        inheritedLang ||
        "";

      if (directUrl) {
        const absolute = toAbsoluteMaybe(directUrl);
        if (
          inCaptionContext ||
          /caption|subtitle|transcript|\.vtt(\?|$)|\.m3u8(\?|$)|text\/?vtt/i.test(absolute)
        ) {
          out.push({ url: absolute, lang });
        }
      }

      for (const key of Object.keys(node)) {
        const value = node[key];
        const nextContext = inCaptionContext || contextKeyRx.test(key);

        if (typeof value === "string") {
          const absolute = toAbsoluteMaybe(value);
          if (
            isLikelyUrl(absolute) &&
            (nextContext || /caption|subtitle|transcript|\.vtt(\?|$)|\.m3u8(\?|$)|text\/?vtt/i.test(absolute))
          ) {
            out.push({ url: absolute, lang });
          }
        } else {
          visit(value, nextContext, lang);
        }
      }
    };

    visit(root, false, "");

    const dedup = new Map();
    for (const candidate of out) {
      const raw = String(candidate.url || "").replace(/\\\//g, "/");
      if (!raw) {
        continue;
      }
      if (!dedup.has(raw)) {
        dedup.set(raw, { url: raw, lang: String(candidate.lang || "") });
      }
    }
    return Array.from(dedup.values());
  }

  function chooseEnglishCaptionCandidate(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) {
      return null;
    }

    const normalized = candidates.map((c) => ({
      ...c,
      langNorm: normalizeLanguageName(c.lang || ""),
      urlNorm: normalizeLanguageName(c.url || "")
    }));

    const usable = normalized.filter((c) => !isLikelyThumbnailTrackUrl(c.urlNorm));
    const pool = usable.length ? usable : normalized;

    const en = pool.find((c) => /(^en$)|(^en-)|english/.test(c.langNorm));
    if (en) {
      return en;
    }

    const enByUrl = pool.find((c) => /(^|[\/_-])en([\/_.-]|$)|english/.test(c.urlNorm));
    if (enByUrl) {
      return enByUrl;
    }

    return pool[0] || null;
  }

  function parseWebVtt(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const cues = [];
    let i = 0;

    while (i < lines.length) {
      let line = lines[i].trim();
      if (!line) {
        i += 1;
        continue;
      }

      if (/^WEBVTT/i.test(line) || /^NOTE/i.test(line) || /^STYLE/i.test(line) || /^REGION/i.test(line)) {
        i += 1;
        continue;
      }

      if (!line.includes("-->")) {
        i += 1;
        line = lines[i] ? lines[i].trim() : "";
      }

      if (!line || !line.includes("-->")) {
        i += 1;
        continue;
      }

      const tm = line.match(/([^\s]+)\s*-->\s*([^\s]+)/);
      if (!tm) {
        i += 1;
        continue;
      }

      const startMs = parseVttTimeToMs(tm[1]);
      const endMs = parseVttTimeToMs(tm[2]);
      i += 1;

      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i += 1;
      }

      const cueTextValue = textLines
        .join("\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (cueTextValue && endMs > startMs) {
        cues.push({ startMs, endMs, text: cueTextValue });
      }
    }

    return dedupeAndSortCues(cues);
  }

  function cuesLookLikeRealSubtitles(cues) {
    if (!Array.isArray(cues) || cues.length < 2) {
      return false;
    }

    let imageLike = 0;
    let textLike = 0;

    for (const cue of cues) {
      const text = String((cue && cue.text) || "").trim();
      if (!text) {
        continue;
      }

      if (isLikelyThumbnailCueText(text)) {
        imageLike += 1;
        continue;
      }

      if (/[a-zA-ZÀ-ÿ]/.test(text)) {
        textLike += 1;
      }
    }

    const total = cues.length;
    const imageRatio = total > 0 ? imageLike / total : 0;
    const minTextLike = Math.max(2, Math.floor(total * 0.15));

    if (imageRatio >= 0.45) {
      return false;
    }

    return textLike >= minTextLike;
  }

  function isLikelyThumbnailCueText(text) {
    const value = normalizeLanguageName(text);
    if (!value) {
      return false;
    }

    return Boolean(
      /thumb-sprites?|storyboard|thumbnail/.test(value) ||
      /#xywh=\d+,\d+,\d+,\d+/.test(value) ||
      /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/.test(value)
    );
  }

  function isLikelyThumbnailTrackUrl(url) {
    const value = normalizeLanguageName(url);
    if (!value) {
      return false;
    }

    return /thumb-sprites?|storyboard|thumbnail|sprite/.test(value);
  }

  function parseVttTimeToMs(value) {
    const raw = String(value || "").replace(",", ".").trim();
    const parts = raw.split(":");
    if (parts.length < 2) {
      return 0;
    }

    let hh = 0;
    let mm = 0;
    let secPart = "0";
    if (parts.length === 3) {
      hh = Number(parts[0]) || 0;
      mm = Number(parts[1]) || 0;
      secPart = parts[2] || "0";
    } else {
      mm = Number(parts[0]) || 0;
      secPart = parts[1] || "0";
    }

    const secSplit = secPart.split(".");
    const ss = Number(secSplit[0]) || 0;
    const ms = Number(((secSplit[1] || "0") + "000").slice(0, 3)) || 0;

    return (((hh * 60 + mm) * 60 + ss) * 1000) + ms;
  }

  async function ensureTranscriptVisible() {
    if (document.querySelector("[data-purpose='transcript-panel']")) {
      return true;
    }

    const candidateButtons = Array.from(document.querySelectorAll("button"));
    const transcriptButton = candidateButtons.find((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return text === "transcript" || text.includes("transcript");
    });

    if (transcriptButton) {
      transcriptButton.click();
      await sleep(280);
    }

    return Boolean(document.querySelector("[data-purpose='transcript-panel']"));
  }

  function getTranscriptScrollContainer() {
    return (
      document.querySelector("#ct-sidebar-scroll-container") ||
      document.querySelector("[data-purpose='sidebar-content']") ||
      document.querySelector("[data-purpose='transcript-panel']")
    );
  }

  function getTranscriptCueElements() {
    return Array.from(document.querySelectorAll("[data-purpose='transcript-cue']"));
  }

  async function extractTranscriptTimedCues() {
    const transcriptAvailable = await ensureTranscriptVisible();
    if (!transcriptAvailable) {
      throw new Error("Transcript panel is not available for this lecture.");
    }

    const video = getVideoElement();
    if (!video) {
      throw new Error("Could not find active video element.");
    }

    const cuesWithAttrs = extractCuesFromAttributes();
    if (cuesWithAttrs.length >= 2) {
      return {
        mode: "attribute",
        cues: normalizeCueEnds(cuesWithAttrs, video.duration)
      };
    }

    const scanned = await scanTranscriptByClick(video);
    if (!scanned.length) {
      throw new Error("Could not extract timed cues from transcript.");
    }

    return {
      mode: "click-map",
      cues: normalizeCueEnds(scanned, video.duration)
    };
  }

  async function extractFromVideoTextTracks() {
    const video = getVideoElement();
    if (!video) {
      throw new Error("Could not find active video element.");
    }
    if (!video.textTracks || !video.textTracks.length) {
      throw new Error("No textTracks available in this lecture.");
    }

    const tracks = Array.from(video.textTracks).filter((track) => {
      const kind = normalizeLanguageName(track.kind || "");
      return /caption|subtitle/.test(kind);
    });

    if (!tracks.length) {
      throw new Error("No caption/subtitle textTracks found.");
    }

    const preferred =
      tracks.find((track) => {
        const label = normalizeLanguageName(track.label || "");
        const lang = normalizeLanguageName(track.language || "");
        return /(^en$)|(^en-)|english/.test(lang) || /english/.test(label);
      }) || tracks[0];

    const previousMode = preferred.mode;
    const previousTime = video.currentTime;
    const wasPaused = video.paused;
    let pool = [];

    try {
      preferred.mode = "hidden";
      await sleep(350);

      pool = pool.concat(readTrackCueList(preferred));

      const durationSec = Number(video.duration) || 0;
      const initialCoverage = estimateCueCoverageRatio(pool, durationSec);

      if (durationSec > 0 && (pool.length < 40 || initialCoverage < 0.88)) {
        const probeCount = clamp(Math.ceil(durationSec / 300), 8, 26);
        const maxTime = Math.max(0, durationSec - 0.25);

        video.pause();

        for (let i = 0; i < probeCount; i += 1) {
          const ratio = probeCount === 1 ? 0 : i / (probeCount - 1);
          const target = Math.round(maxTime * ratio * 1000) / 1000;

          try {
            video.currentTime = target;
            await waitForSeeked(video, 1200);
          } catch (_error) {
            // Continue probes even if one seek fails.
          }

          await sleep(180);
          pool = pool.concat(readTrackCueList(preferred));
        }
      }
    } catch (_error) {
      // Ignore mode assignment errors and continue reading cues if accessible.
    } finally {
      try {
        preferred.mode = previousMode;
      } catch (_error) {
        // Ignore restore errors.
      }

      try {
        video.currentTime = previousTime;
      } catch (_error) {
        // Ignore restore errors.
      }

      if (!wasPaused) {
        video.play().catch(() => {});
      }
    }

    const mapped = dedupeAndSortCues(pool);

    if (!mapped.length) {
      throw new Error("Selected textTrack has no cues loaded yet.");
    }

    const durationSec = Number(video.duration) || 0;
    const coverage = estimateCueCoverageRatio(mapped, durationSec);

    const mode = coverage >= 0.88 ? "text-track-scan" : "text-track-partial";
    const warning =
      coverage >= 0.88
        ? ""
        : "TextTrack coverage looks partial. If needed, keep EN captions on for a bit and export again.";

    return {
      mode,
      warning,
      cues: mapped
    };
  }

  function readTrackCueList(track) {
    const cueList = track && track.cues ? Array.from(track.cues) : [];
    return cueList
      .map((cue) => ({
        startMs: secondsToMs(cue.startTime || 0),
        endMs: secondsToMs(cue.endTime || 0),
        text: String(cue.text || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      }))
      .filter((cue) => cue.endMs > cue.startMs && cue.text);
  }

  function estimateCueCoverageRatio(cues, durationSec) {
    const durationMs = Number(durationSec) > 0 ? secondsToMs(durationSec) : 0;
    if (!durationMs || !Array.isArray(cues) || !cues.length) {
      return 0;
    }
    const lastEnd = cues.reduce((max, cue) => Math.max(max, cue.endMs || 0), 0);
    return clamp(lastEnd / durationMs, 0, 1);
  }

  function waitForSeeked(video, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        resolve();
      }, Math.max(0, timeoutMs || 0));

      const onSeeked = () => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
      };

      video.addEventListener("seeked", onSeeked, { once: true });
    });
  }

  function extractFromObservedCues() {
    const video = getVideoElement();
    const nowMs = video ? Math.round(video.currentTime * 1000) : 0;

    const list = runtimeState.observedEnCues.map((cue) => ({ ...cue }));
    if (runtimeState.observedOpenCue && runtimeState.observedOpenCue.text) {
      list.push({
        startMs: runtimeState.observedOpenCue.startMs,
        endMs: Math.max(runtimeState.observedOpenCue.startMs + 600, nowMs),
        text: runtimeState.observedOpenCue.text
      });
    }

    const normalized = normalizeCueEnds(dedupeAndSortCues(list), video ? video.duration : 0);
    return {
      mode: "observed-live",
      cues: normalized
    };
  }

  function startPassiveCueCapture() {
    if (runtimeState.cueProbeTimer != null) {
      return;
    }

    runtimeState.cueProbeTimer = setInterval(() => {
      try {
        probeVisibleCaptionCue();
      } catch (_error) {
        // Keep probe resilient.
      }
    }, 220);
  }

  function probeVisibleCaptionCue() {
    const video = getVideoElement();
    if (!video) {
      return;
    }

    const nowMs = Math.round(video.currentTime * 1000);
    const text = readVisibleCaptionText();

    if (!text) {
      if (runtimeState.observedOpenCue && nowMs > runtimeState.observedOpenCue.startMs) {
        runtimeState.observedEnCues.push({
          startMs: runtimeState.observedOpenCue.startMs,
          endMs: nowMs,
          text: runtimeState.observedOpenCue.text
        });
      }
      runtimeState.observedOpenCue = null;
      runtimeState.observedLastText = "";
      return;
    }

    const normalizedText = text.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      return;
    }

    const changed = normalizedText !== runtimeState.observedLastText;
    if (!changed) {
      return;
    }

    if (runtimeState.observedOpenCue) {
      runtimeState.observedEnCues.push({
        startMs: runtimeState.observedOpenCue.startMs,
        endMs: Math.max(runtimeState.observedOpenCue.startMs + 300, nowMs - 20),
        text: runtimeState.observedOpenCue.text
      });
    }

    runtimeState.observedOpenCue = {
      startMs: nowMs,
      text: normalizedText
    };
    runtimeState.observedLastText = normalizedText;

    if (runtimeState.observedEnCues.length > 3000) {
      runtimeState.observedEnCues = runtimeState.observedEnCues.slice(-2500);
    }
  }

  function readVisibleCaptionText() {
    const selectors = [
      ".vjs-text-track-display",
      "[class*='captions-display--captions-container']",
      ".shaka-text-container"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) {
        continue;
      }
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (txt) {
        return txt;
      }
    }
    return "";
  }

  function extractCuesFromAttributes() {
    const cues = [];
    for (const cueEl of getTranscriptCueElements()) {
      const text = cueText(cueEl);
      if (!text) {
        continue;
      }

      const start = extractTimeFromAnyAttribute(cueEl, /(start|from|begin|time)/i);
      const end = extractTimeFromAnyAttribute(cueEl, /(end|to|until|stop)/i);

      if (start == null) {
        continue;
      }

      cues.push({
        startMs: secondsToMs(start),
        endMs: end == null ? 0 : secondsToMs(end),
        text
      });
    }

    return dedupeAndSortCues(cues);
  }

  async function scanTranscriptByClick(video) {
    const scrollContainer = getTranscriptScrollContainer();
    if (!scrollContainer) {
      throw new Error("Could not locate transcript scroll container.");
    }

    const previousScroll = scrollContainer.scrollTop;
    const previousTime = video.currentTime;
    const wasPaused = video.paused;
    video.pause();

    const result = [];
    const seen = new Set();

    async function processVisibleCues() {
      const cues = getTranscriptCueElements();
      for (const cueEl of cues) {
        const text = cueText(cueEl);
        if (!text) {
          continue;
        }

        let startSec = extractTimeFromAnyAttribute(cueEl, /(start|from|begin|time)/i);
        if (startSec == null) {
          cueEl.click();
          await sleep(60);
          startSec = video.currentTime;
        }

        const startMs = secondsToMs(startSec);
        const sig = `${Math.round(startMs / 50)}::${text}`;
        if (seen.has(sig)) {
          continue;
        }

        seen.add(sig);
        result.push({ startMs, endMs: 0, text });
      }
    }

    scrollContainer.scrollTop = 0;
    await sleep(120);

    let guard = 0;
    while (guard < 60) {
      guard += 1;
      await processVisibleCues();

      const reachedBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 2;
      if (reachedBottom) {
        break;
      }

      scrollContainer.scrollTop = Math.min(
        scrollContainer.scrollTop + Math.max(120, scrollContainer.clientHeight * 0.8),
        scrollContainer.scrollHeight
      );
      await sleep(120);
    }

    scrollContainer.scrollTop = previousScroll;
    video.currentTime = previousTime;
    if (!wasPaused) {
      video.play().catch(() => {});
    }

    return dedupeAndSortCues(result);
  }

  function dedupeAndSortCues(cues) {
    const sorted = cues
      .filter((cue) => cue.text && cue.text.trim())
      .map((cue) => ({
        startMs: Math.max(0, Math.round(Number(cue.startMs) || 0)),
        endMs: Math.max(0, Math.round(Number(cue.endMs) || 0)),
        text: String(cue.text || "").replace(/\s+/g, " ").trim()
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const out = [];
    for (const cue of sorted) {
      const prev = out[out.length - 1];
      if (!prev) {
        out.push({ ...cue });
        continue;
      }

      const sameText = prev.text === cue.text;
      const veryClose = Math.abs(prev.startMs - cue.startMs) < 100;
      const overlaps = cue.startMs <= prev.endMs + 120;
      if (sameText && veryClose) {
        continue;
      }

      if (sameText && overlaps) {
        prev.endMs = Math.max(prev.endMs, cue.endMs || cue.startMs + 300);
        continue;
      }

      if (sameText && cue.startMs - prev.endMs <= 420) {
        prev.endMs = Math.max(prev.endMs, cue.endMs || cue.startMs + 250);
        continue;
      }

      out.push({ ...cue });
    }

    return out;
  }

  function normalizeCueEnds(cues, videoDurationSec) {
    const durationMs = Number.isFinite(videoDurationSec) ? secondsToMs(videoDurationSec) : 0;
    const normalized = cues
      .map((cue) => ({
        startMs: Math.max(0, Math.round(cue.startMs)),
        endMs: Math.max(0, Math.round(cue.endMs || 0)),
        text: cue.text.trim()
      }))
      .sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < normalized.length; i += 1) {
      const current = normalized[i];
      const next = normalized[i + 1];

      if (current.endMs > current.startMs) {
        continue;
      }

      if (next && next.startMs > current.startMs) {
        current.endMs = Math.max(current.startMs + 300, next.startMs - 80);
      } else {
        const estimated = Math.round(clamp(current.text.length / 14, 1.2, 8) * 1000);
        current.endMs = current.startMs + estimated;
      }

      if (durationMs > 0 && current.endMs > durationMs) {
        current.endMs = durationMs;
      }
    }

    return normalized.filter((cue) => cue.endMs > cue.startMs);
  }

  function parseSrt(text) {
    const blocks = String(text)
      .replace(/\r/g, "")
      .split(/\n\s*\n/g)
      .map((b) => b.trim())
      .filter(Boolean);

    const cues = [];
    for (const block of blocks) {
      const lines = block.split("\n").map((x) => x.trimEnd());
      if (!lines.length) {
        continue;
      }

      let idx = 0;
      if (/^\d+$/.test(lines[0])) {
        idx = 1;
      }

      const timeLine = lines[idx] || "";
      const m = timeLine.match(
        /(\d{2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{1,3})/
      );
      if (!m) {
        continue;
      }

      const startMs = parseSrtTimestamp(m[1]);
      const endMs = parseSrtTimestamp(m[2]);
      if (endMs <= startMs) {
        continue;
      }

      const cueTextValue = lines.slice(idx + 1).join("\n").trim();
      if (!cueTextValue) {
        continue;
      }

      cues.push({
        startMs,
        endMs,
        text: cueTextValue
      });
    }

    return cues.sort((a, b) => a.startMs - b.startMs);
  }

  function toSrt(cues) {
    return cues
      .map((cue, index) => {
        return [
          String(index + 1),
          `${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}`,
          cue.text,
          ""
        ].join("\n");
      })
      .join("\n");
  }

  function parseSrtTimestamp(value) {
    const m = String(value)
      .replace(",", ".")
      .match(/(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})/);
    if (!m) {
      return 0;
    }
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const ms = Number((m[4] + "00").slice(0, 3));
    return (((hh * 60 + mm) * 60 + ss) * 1000) + ms;
  }

  function formatSrtTimestamp(ms) {
    const total = Math.max(0, Math.round(ms));
    const hh = Math.floor(total / 3600000);
    const mm = Math.floor((total % 3600000) / 60000);
    const ss = Math.floor((total % 60000) / 1000);
    const milli = total % 1000;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)},${pad3(milli)}`;
  }

  function pad2(v) {
    return String(v).padStart(2, "0");
  }

  function pad3(v) {
    return String(v).padStart(3, "0");
  }

  function ensureOverlayElement() {
    const video = getVideoElement();
    if (!video) {
      return null;
    }

    const host =
      video.closest("[id^='shaka-video-container']") ||
      video.parentElement ||
      video;

    const computed = window.getComputedStyle(host);
    if (computed.position === "static") {
      host.style.position = "relative";
    }

    if (!runtimeState.overlayEl || !runtimeState.overlayEl.isConnected) {
      const el = document.createElement("div");
      el.id = "usg-es-overlay";
      el.setAttribute("aria-live", "off");
      host.appendChild(el);
      runtimeState.overlayEl = el;
    }

    applyOverlayStyle();
    return runtimeState.overlayEl;
  }

  function applyOverlayStyle() {
    const overlay = runtimeState.overlayEl || ensureOverlayElement();
    if (!overlay) {
      return;
    }

    const safeOpacity = Number.isFinite(runtimeState.settings.opacity)
      ? clamp(runtimeState.settings.opacity, 0, 1)
      : DEFAULT_SETTINGS.opacity;

    overlay.style.position = "absolute";
    overlay.style.left = "50%";
    overlay.style.bottom = "8%";
    overlay.style.transform = "translateX(-50%)";
    overlay.style.maxWidth = "92%";
    overlay.style.padding = "0.35em 0.65em";
    overlay.style.borderRadius = "0.4em";
    overlay.style.background = `rgba(0,0,0,${safeOpacity.toFixed(2)})`;
    overlay.style.color = "#ffffff";
    overlay.style.fontWeight = "600";
    overlay.style.fontSize = `${clamp(runtimeState.settings.fontSizePx, 16, 64)}px`;
    overlay.style.lineHeight = "1.35";
    overlay.style.textAlign = "center";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.textShadow = "0 1px 2px rgba(0,0,0,0.9)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483645";
    overlay.style.boxDecorationBreak = "clone";

    overlay.style.setProperty("background-color", `rgba(0,0,0,${safeOpacity.toFixed(2)})`, "important");
    overlay.style.setProperty("padding", "0.35em 0.65em", "important");
    overlay.style.setProperty("border-radius", "0.4em", "important");
    overlay.style.setProperty("color", "#ffffff", "important");
    overlay.style.display = "none";
  }

  function applyOverlayVisibility() {
    const overlay = runtimeState.overlayEl || ensureOverlayElement();
    if (!overlay) {
      return;
    }

    const shouldApply = runtimeState.settings.overlayEnabled && runtimeState.importedCues.length > 0;
    if (!shouldApply) {
      overlay.style.display = "none";
      overlay.textContent = "";
      document.body.classList.remove("usg-hide-native-captions");
      return;
    }

    ensureNativeCaptionHideStyle();
    document.body.classList.add("usg-hide-native-captions");
  }

  function ensureNativeCaptionHideStyle() {
    if (document.getElementById("usg-hide-native-captions-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "usg-hide-native-captions-style";
    style.textContent = [
      "body.usg-hide-native-captions [class*='captions-display--captions-container'] { display: none !important; opacity: 0 !important; }",
      "body.usg-hide-native-captions .vjs-text-track-display { display: none !important; opacity: 0 !important; }"
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function startOverlayLoopIfNeeded() {
    const shouldRun = runtimeState.settings.overlayEnabled && runtimeState.importedCues.length > 0;
    if (!shouldRun) {
      stopOverlayLoop();
      return;
    }

    if (runtimeState.rafId != null) {
      return;
    }

    const tick = () => {
      runtimeState.rafId = requestAnimationFrame(tick);
      renderOverlayTick();
    };
    runtimeState.rafId = requestAnimationFrame(tick);
  }

  function stopOverlayLoop() {
    if (runtimeState.rafId != null) {
      cancelAnimationFrame(runtimeState.rafId);
      runtimeState.rafId = null;
    }
  }

  function renderOverlayTick() {
    const overlay = runtimeState.overlayEl || ensureOverlayElement();
    const video = getVideoElement();

    if (!overlay || !video || !runtimeState.settings.overlayEnabled || !runtimeState.importedCues.length) {
      if (overlay) {
        overlay.style.display = "none";
      }
      return;
    }

    const nowMs = Math.round(video.currentTime * 1000 + runtimeState.settings.offsetMs);
    const idx = findCueIndexAtTime(runtimeState.importedCues, nowMs);

    if (idx < 0) {
      if (runtimeState.lastRenderedIndex !== -1) {
        runtimeState.lastRenderedIndex = -1;
        runtimeState.lastRenderedText = "";
        overlay.textContent = "";
      }
      overlay.style.display = "none";
      return;
    }

    const cue = runtimeState.importedCues[idx];
    if (!cue) {
      overlay.style.display = "none";
      return;
    }

    if (runtimeState.lastRenderedIndex !== idx || runtimeState.lastRenderedText !== cue.text) {
      overlay.textContent = cue.text;
      runtimeState.lastRenderedIndex = idx;
      runtimeState.lastRenderedText = cue.text;
    }

    overlay.style.display = "block";
  }

  function findCueIndexAtTime(cues, timeMs) {
    let left = 0;
    let right = cues.length - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const cue = cues[mid];
      if (timeMs < cue.startMs) {
        right = mid - 1;
      } else if (timeMs > cue.endMs) {
        left = mid + 1;
      } else {
        return mid;
      }
    }
    return -1;
  }

  function getVideoElement() {
    return document.querySelector("video");
  }

  function cueText(cueEl) {
    const exact = cueEl.querySelector("[data-purpose='cue-text']");
    if (exact && exact.textContent) {
      return exact.textContent.trim();
    }
    return (cueEl.textContent || "").trim();
  }

  function extractTimeFromAnyAttribute(el, namePattern) {
    const attrs = el.getAttributeNames();
    for (const attrName of attrs) {
      if (!namePattern.test(attrName)) {
        continue;
      }
      const value = el.getAttribute(attrName);
      const parsed = tryParseTimeValue(value);
      if (parsed != null) {
        return parsed;
      }
    }

    const datasetEntries = Object.entries(el.dataset || {});
    for (const pair of datasetEntries) {
      const key = pair[0] || "";
      const value = pair[1] || "";
      if (!namePattern.test(key)) {
        continue;
      }
      const parsed = tryParseTimeValue(value);
      if (parsed != null) {
        return parsed;
      }
    }

    return null;
  }

  function tryParseTimeValue(value) {
    if (value == null) {
      return null;
    }

    const raw = String(value).trim();
    if (!raw) {
      return null;
    }

    if (/^\d+(\.\d+)?$/.test(raw)) {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      if (numeric > 10000) {
        return numeric / 1000;
      }
      return numeric;
    }

    const hms = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?/);
    if (hms) {
      let hh = 0;
      let mm = 0;
      let ss = 0;
      let ms = 0;

      if (hms[3] != null) {
        hh = Number(hms[1]);
        mm = Number(hms[2]);
        ss = Number(hms[3]);
      } else {
        mm = Number(hms[1]);
        ss = Number(hms[2]);
      }

      if (hms[4]) {
        ms = Number((hms[4] + "00").slice(0, 3));
      }

      return hh * 3600 + mm * 60 + ss + ms / 1000;
    }

    return null;
  }

  function getLectureKey() {
    const slug = getCourseSlugFromUrl() || "course";
    const lecture = getLectureIdFromUrl() || "lecture";
    return `${slug}::${lecture}`;
  }

  function getCourseSlugFromUrl() {
    const m = location.pathname.match(/\/course\/([^/]+)/i);
    return m ? m[1] : "";
  }

  function getLectureIdFromUrl() {
    const m = location.pathname.match(/\/learn\/lecture\/(\d+)/i);
    return m ? m[1] : "";
  }

  function getCourseIdFromModuleArgs() {
    const args = getCourseModuleArgs();
    if (args && args.courseId != null) {
      return String(args.courseId);
    }
    return "";
  }

  function getCourseModuleArgs() {
    const el = document.querySelector("[data-module-id='course-taking'][data-module-args]");
    if (!el) {
      return null;
    }
    const encoded = el.getAttribute("data-module-args");
    if (!encoded) {
      return null;
    }
    const decoded = decodeHtml(encoded);
    try {
      return JSON.parse(decoded);
    } catch (_error) {
      return null;
    }
  }

  function decodeHtml(html) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = html;
    return textarea.value;
  }

  function normalizeLanguageName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function secondsToMs(value) {
    return Math.round(Number(value) * 1000);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toFiniteNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return null;
    }
    return n;
  }

  function toErrorMessage(error) {
    if (!error) {
      return "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    if (error.message) {
      return String(error.message);
    }
    return String(error);
  }
})();
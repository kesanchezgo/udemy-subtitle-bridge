(function () {
  "use strict";

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
    autoDownloadRetryTimer: null,
    autoTranslatePromise: null,
    autoTranslateAttempt: 0,
    autoTranslateLastError: "",
    autoTranslateRetryTimer: null,
    autoTranslatedForLecture: false,
    coursePanelEl: null,
    coursePanelStatusEl: null,
    coursePanelMetaEl: null,
    coursePanelRetryBtn: null,
    coursePanelOverlayCheckbox: null,
    coursePanelFlashEl: null,
    coursePanelCollapsed: false,
    coursePanelTimer: null,
    learningPanelEl: null,
    learningPanelStatusEl: null,
    learningPanelTabsEl: null,
    learningPanelContentEl: null,
    learningPanelGenerateBtn: null,
    learningPanelEntry: null,
    learningPanelBusy: false,
    learningPanelError: ""
  };

  init().catch(() => {
    // Keep content script resilient. Popup can still show actionable errors.
  });

  async function init() {
    // CRITICAL PATH ONLY: Just inject the learning panel fast, don't block page load
    try {
      runtimeState.lectureKey = getLectureKey();
      ensureLearningPanel(); // Non-blocking injection of panel DOM
    } catch (e) {
      console.error("[USG] Critical panel injection failed:", e);
    }

    // DEFERRED NON-CRITICAL: Load settings and state in background (won't block page)
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => loadBackgroundState(), { timeout: 5000 });
    } else {
      setTimeout(() => loadBackgroundState(), 100);
    }
  }

  async function loadBackgroundState() {
    try {
      runtimeState.settings = await loadSettings();
      runtimeState.importedCues = await loadImportedCuesForCurrentLecture();
      runtimeState.autoEnEntry = await loadAutoEnglishForCurrentLecture();
      runtimeState.autoDownloadedForLecture = await hasAutoDownloadedForCurrentLecture(runtimeState.autoEnEntry);
      runtimeState.autoTranslatedForLecture = runtimeState.importedCues.length > 0;
      runtimeState.learningPanelEntry = await loadLearningPanelForCurrentLecture();

      // Non-critical pipelines
      setupPageNetworkCaptureBridge();
      ensureOverlayElement();
      ensureCoursePanel();
      startPassiveCueCapture();
      startProactivePrefetch();
      startAutoEnglishPipeline();
      startAutoSpanishPipeline();
      startCoursePanelStatusLoop();
      applyOverlayVisibility();
      refreshCoursePanelStatus().catch(() => {});
      refreshLearningPanelUI();
      startUrlWatcher();
      setupMessageHandler();
      startOverlayLoopIfNeeded();
    } catch (e) {
      console.error("[USG] Background state load failed (non-critical):", e);
      // Continue anyway - just message handler won't work, but panel is still there
      try {
        setupMessageHandler();
      } catch (e2) {
        console.error("[USG] Message handler setup failed:", e2);
      }
    }
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

      if (type === "USG_GET_STUDY_TRANSCRIPT") {
        getStudyTranscriptPayload(message || {})
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

      if (type === "USG_RETRY_AUTO_TRANSLATE") {
        retryAutoSpanishTranslation()
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

  function ensureCoursePanel() {
    if (runtimeState.coursePanelEl && runtimeState.coursePanelEl.isConnected) {
      return runtimeState.coursePanelEl;
    }

    ensureCoursePanelStyle();

    const root = document.createElement("aside");
    root.id = "usg-course-panel";

    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = "usg-course-panel-tab";
    tabBtn.textContent = "Subtitles AI";
    tabBtn.addEventListener("click", () => {
      setCoursePanelCollapsed(!runtimeState.coursePanelCollapsed);
    });

    const body = document.createElement("div");
    body.className = "usg-course-panel-body";

    const header = document.createElement("div");
    header.className = "usg-course-panel-header";

    const title = document.createElement("strong");
    title.textContent = "Subtitle Assistant";

    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "usg-course-panel-collapse";
    collapseBtn.textContent = "-";
    collapseBtn.title = "Collapse";
    collapseBtn.addEventListener("click", () => {
      setCoursePanelCollapsed(true);
    });

    header.appendChild(title);
    header.appendChild(collapseBtn);

    const status = document.createElement("p");
    status.className = "usg-course-panel-status";
    status.textContent = "Preparing subtitles...";

    const meta = document.createElement("p");
    meta.className = "usg-course-panel-meta";
    meta.textContent = "EN: - | ES: -";

    const controls = document.createElement("div");
    controls.className = "usg-course-panel-controls";

    const overlayLabel = document.createElement("label");
    overlayLabel.className = "usg-course-panel-switch";

    const overlayCheck = document.createElement("input");
    overlayCheck.type = "checkbox";
    overlayCheck.addEventListener("change", async () => {
      try {
        await setOverlayEnabled(Boolean(overlayCheck.checked));
        setCoursePanelFlash("Overlay updated.", false);
        refreshCoursePanelStatus().catch(() => {});
      } catch (error) {
        setCoursePanelFlash(toErrorMessage(error), true);
        refreshCoursePanelStatus().catch(() => {});
      }
    });

    const overlayText = document.createElement("span");
    overlayText.textContent = "ES overlay";

    overlayLabel.appendChild(overlayCheck);
    overlayLabel.appendChild(overlayText);

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "usg-course-panel-retry";
    retryBtn.textContent = "Retry EN -> ES";
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      try {
        await retryAutoSpanishTranslation();
        setCoursePanelFlash("Auto translation retry started.", false);
      } catch (error) {
        setCoursePanelFlash(toErrorMessage(error), true);
      } finally {
        refreshCoursePanelStatus().catch(() => {});
      }
    });

    controls.appendChild(overlayLabel);
    controls.appendChild(retryBtn);

    const flash = document.createElement("p");
    flash.className = "usg-course-panel-flash";
    flash.textContent = "";

    body.appendChild(header);
    body.appendChild(status);
    body.appendChild(meta);
    body.appendChild(controls);
    body.appendChild(flash);

    root.appendChild(tabBtn);
    root.appendChild(body);

    (document.body || document.documentElement).appendChild(root);

    runtimeState.coursePanelEl = root;
    runtimeState.coursePanelStatusEl = status;
    runtimeState.coursePanelMetaEl = meta;
    runtimeState.coursePanelRetryBtn = retryBtn;
    runtimeState.coursePanelOverlayCheckbox = overlayCheck;
    runtimeState.coursePanelFlashEl = flash;

    setCoursePanelCollapsed(runtimeState.coursePanelCollapsed);
    return root;
  }

  function ensureLearningPanel() {
    if (runtimeState.learningPanelEl && runtimeState.learningPanelEl.isConnected) {
      return runtimeState.learningPanelEl;
    }

    ensureLearningPanelStyle();

    const container = findVideoContainer();
    if (!container) {
      observeVideoContainerForPanel();
      return null;
    }

    const panel = document.createElement("section");
    panel.id = "usg-learning-panel";

    const header = document.createElement("div");
    header.className = "usg-learning-panel-header";

    const title = document.createElement("h3");
    title.textContent = "Learning Panel";

    const status = document.createElement("span");
    status.className = "usg-learning-panel-status";
    status.textContent = "Ready to generate.";

    header.appendChild(title);
    header.appendChild(status);

    const controls = document.createElement("div");
    controls.className = "usg-learning-panel-controls";

    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "usg-learning-panel-generate";
    generateBtn.textContent = "Generate Panel";
    generateBtn.addEventListener("click", () => {
      generateLearningPanel().catch(() => {});
    });

    controls.appendChild(generateBtn);

    const tabs = document.createElement("div");
    tabs.className = "usg-learning-panel-tabs";

    const tabSummary = createLearningTabButton("summary", "Resumen", true);
    const tabQuiz = createLearningTabButton("quiz", "Cuestionario", false);
    const tabCode = createLearningTabButton("code", "Code Task", false);

    tabs.appendChild(tabSummary);
    tabs.appendChild(tabQuiz);
    tabs.appendChild(tabCode);

    const content = document.createElement("div");
    content.className = "usg-learning-panel-content";

    panel.appendChild(header);
    panel.appendChild(controls);
    panel.appendChild(tabs);
    panel.appendChild(content);

    container.insertAdjacentElement("afterend", panel);

    runtimeState.learningPanelEl = panel;
    runtimeState.learningPanelStatusEl = status;
    runtimeState.learningPanelTabsEl = tabs;
    runtimeState.learningPanelContentEl = content;
    runtimeState.learningPanelGenerateBtn = generateBtn;

    tabs.addEventListener("click", (event) => {
      const btn = event.target && event.target.closest("button[data-tab]");
      if (!btn) {
        return;
      }
      setLearningPanelTab(btn.dataset.tab || "summary");
    });

    content.addEventListener("click", (event) => {
      const target = event.target && event.target.closest("button[data-quiz]");
      if (!target) {
        return;
      }
      const isCorrect = target.dataset.correct === "true";
      const explain = target.dataset.explain || "";
      const result = target.closest(".usg-quiz-block");
      if (!result) {
        return;
      }
      const feedback = result.querySelector(".usg-quiz-feedback");
      if (feedback) {
        feedback.textContent = isCorrect ? `Correcto. ${explain}` : `Incorrecto. ${explain}`;
        feedback.classList.toggle("ok", isCorrect);
      }
    });

    refreshLearningPanelUI();
    return panel;
  }

  function ensureLearningPanelStyle() {
    if (document.getElementById("usg-learning-panel-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "usg-learning-panel-style";
    style.textContent = [
      "#usg-learning-panel {",
      "  margin: 16px 0;",
      "  background: #131b26;",
      "  border: 1px solid #26364c;",
      "  border-radius: 12px;",
      "  padding: 12px 14px;",
      "  color: #e6eef7;",
      "}",
      "#usg-learning-panel h3 {",
      "  margin: 0;",
      "  font-size: 16px;",
      "  color: #e7f2ff;",
      "}",
      "#usg-learning-panel .usg-learning-panel-header {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  gap: 10px;",
      "  margin-bottom: 10px;",
      "}",
      "#usg-learning-panel .usg-learning-panel-status {",
      "  font-size: 12px;",
      "  color: #9fb2cc;",
      "}",
      "#usg-learning-panel .usg-learning-panel-controls {",
      "  display: flex;",
      "  justify-content: flex-end;",
      "  margin-bottom: 10px;",
      "}",
      "#usg-learning-panel .usg-learning-panel-generate {",
      "  border: 1px solid #33517a;",
      "  background: #1f3856;",
      "  color: #e8eef8;",
      "  border-radius: 8px;",
      "  padding: 7px 10px;",
      "  font-size: 12px;",
      "  cursor: pointer;",
      "}",
      "#usg-learning-panel .usg-learning-panel-generate:disabled {",
      "  opacity: 0.6;",
      "  cursor: default;",
      "}",
      "#usg-learning-panel .usg-learning-panel-tabs {",
      "  display: flex;",
      "  gap: 8px;",
      "  margin-bottom: 12px;",
      "  flex-wrap: wrap;",
      "}",
      "#usg-learning-panel .usg-learning-panel-tab {",
      "  border: 1px solid #2f4560;",
      "  background: #182635;",
      "  color: #cfe0f6;",
      "  border-radius: 999px;",
      "  padding: 5px 12px;",
      "  font-size: 12px;",
      "  cursor: pointer;",
      "}",
      "#usg-learning-panel .usg-learning-panel-tab.active {",
      "  background: #254463;",
      "  color: #ffffff;",
      "}",
      "#usg-learning-panel .usg-learning-panel-content {",
      "  font-size: 13px;",
      "  line-height: 1.5;",
      "  color: #dbe7f6;",
      "}",
      "#usg-learning-panel .usg-learning-panel-section {",
      "  display: none;",
      "}",
      "#usg-learning-panel .usg-learning-panel-section.active {",
      "  display: block;",
      "}",
      "#usg-learning-panel .usg-keypoints {",
      "  margin: 0 0 10px;",
      "  padding-left: 18px;",
      "}",
      "#usg-learning-panel .usg-quiz-options {",
      "  display: grid;",
      "  gap: 6px;",
      "  margin-top: 6px;",
      "}",
      "#usg-learning-panel .usg-quiz-options button {",
      "  text-align: left;",
      "  border: 1px solid #2d4662;",
      "  background: #182739;",
      "  color: #e6eff9;",
      "  border-radius: 8px;",
      "  padding: 6px 8px;",
      "  font-size: 12px;",
      "  cursor: pointer;",
      "}",
      "#usg-learning-panel .usg-quiz-feedback {",
      "  margin-top: 6px;",
      "  font-size: 12px;",
      "  color: #f2b5c1;",
      "}",
      "#usg-learning-panel .usg-quiz-feedback.ok {",
      "  color: #a7ffd8;",
      "}",
      "#usg-learning-panel pre {",
      "  background: #0f1724;",
      "  border: 1px solid #2b3d55;",
      "  border-radius: 8px;",
      "  padding: 10px;",
      "  overflow: auto;",
      "}",
      "#usg-learning-panel code {",
      "  font-family: 'Consolas', 'Courier New', monospace;",
      "  font-size: 12px;",
      "}",
      "#usg-learning-panel .usg-learning-panel-note {",
      "  font-size: 12px;",
      "  color: #9fb2cc;",
      "  margin-top: 6px;",
      "}",
      "#usg-learning-panel .usg-learning-panel-error {",
      "  color: #ffbdc7;",
      "  font-size: 12px;",
      "}",
      "@media (max-width: 760px) {",
      "  #usg-learning-panel { padding: 10px; }",
      "  #usg-learning-panel .usg-learning-panel-tabs { gap: 6px; }",
      "}",
      ""
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function findVideoContainer() {
    return document.querySelector('[data-purpose="video-player"]')
      || document.querySelector(".video-player--container--")
      || document.querySelector(".well--container--")
      || document.querySelector(".udlite-instructor-video")
      || null;
  }

  function observeVideoContainerForPanel() {
    if (runtimeState.learningPanelEl) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (ensureLearningPanel()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  function createLearningTabButton(tabId, label, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "usg-learning-panel-tab";
    btn.dataset.tab = tabId;
    btn.textContent = label;
    if (active) {
      btn.classList.add("active");
    }
    return btn;
  }

  function setLearningPanelTab(tabId) {
    if (!runtimeState.learningPanelTabsEl || !runtimeState.learningPanelContentEl) {
      return;
    }

    const buttons = runtimeState.learningPanelTabsEl.querySelectorAll("button[data-tab]");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });

    const sections = runtimeState.learningPanelContentEl.querySelectorAll(".usg-learning-panel-section");
    sections.forEach((section) => {
      section.classList.toggle("active", section.dataset.tab === tabId);
    });
  }

  async function generateLearningPanel() {
    if (runtimeState.learningPanelBusy) {
      return;
    }

    runtimeState.learningPanelBusy = true;
    runtimeState.learningPanelError = "";
    refreshLearningPanelUI();

    try {
      const transcriptText = await getLearningPanelTranscriptText();
      if (!transcriptText || transcriptText.length < 120) {
        throw new Error("Transcript is too short. Open Transcript and try again.");
      }

      const response = await sendMessageToExtension({
        type: "USG_GENERATE_LEARNING_PANEL",
        transcriptText,
        lectureKey: runtimeState.lectureKey,
        courseSlug: getCourseSlugFromUrl(),
        lectureId: getLectureIdFromUrl()
      });

      if (!response || !response.ok || !response.payload) {
        throw new Error((response && response.error) || "Learning panel generation failed.");
      }

      const entry = {
        generatedAt: new Date().toISOString(),
        payload: response.payload
      };

      await saveLearningPanelForCurrentLecture(entry);
      runtimeState.learningPanelEntry = entry;
    } catch (error) {
      runtimeState.learningPanelError = toErrorMessage(error);
    } finally {
      runtimeState.learningPanelBusy = false;
      refreshLearningPanelUI();
    }
  }

  async function getLearningPanelTranscriptText() {
    const transcriptDomText = readTranscriptTextFromDom();
    if (transcriptDomText && transcriptDomText.length > 120) {
      return transcriptDomText;
    }

    if (runtimeState.importedCues.length >= 2) {
      return buildTranscriptFromCues(runtimeState.importedCues, 12000);
    }

    if (runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt) {
      const cues = parseSrt(runtimeState.autoEnEntry.srt);
      if (cues.length >= 2) {
        return buildTranscriptFromCues(cues, 12000);
      }
    }

    if (runtimeState.prefetchedEnCues.length >= 2) {
      return buildTranscriptFromCues(runtimeState.prefetchedEnCues, 12000);
    }

    return readLectureTitleAndDescription();
  }

  function readTranscriptTextFromDom() {
    const elements = getTranscriptCueElements();
    if (!elements || !elements.length) {
      return "";
    }
    const lines = [];
    for (const el of elements) {
      const txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (txt) {
        lines.push(txt);
      }
    }
    return lines.join("\n");
  }

  function buildTranscriptFromCues(cues, maxChars) {
    const out = [];
    let used = 0;
    let previous = "";
    const safeMax = clamp(Number(maxChars) || 12000, 2000, 60000);

    for (const cue of cues) {
      const line = String((cue && cue.text) || "").replace(/\s+/g, " ").trim();
      if (!line || line === previous) {
        continue;
      }
      previous = line;

      const extra = out.length ? line.length + 1 : line.length;
      if (used + extra > safeMax) {
        break;
      }
      out.push(line);
      used += extra;
    }

    return out.join("\n");
  }

  function readLectureTitleAndDescription() {
    const titleEl = document.querySelector("[data-purpose='lecture-title']")
      || document.querySelector("h1[data-purpose='course-title']")
      || document.querySelector("h1");
    const descEl = document.querySelector("[data-purpose='lecture-description']")
      || document.querySelector("[data-purpose='description']")
      || document.querySelector(".lecture-description")
      || null;

    const title = titleEl ? String(titleEl.textContent || "").trim() : "";
    const desc = descEl ? String(descEl.textContent || "").trim() : "";

    return [title, desc].filter(Boolean).join("\n\n");
  }

  async function loadLearningPanelForCurrentLecture() {
    const key = getLectureKey();
    const data = await chrome.storage.local.get(STORAGE_KEYS.learningPanelByLecture);
    const map = data && data[STORAGE_KEYS.learningPanelByLecture];
    if (!map || typeof map !== "object") {
      return null;
    }
    return map[key] || null;
  }

  async function saveLearningPanelForCurrentLecture(entry) {
    const key = getLectureKey();
    const data = await chrome.storage.local.get(STORAGE_KEYS.learningPanelByLecture);
    const map = data && data[STORAGE_KEYS.learningPanelByLecture];
    const next = map && typeof map === "object" ? map : {};
    next[key] = entry;
    await chrome.storage.local.set({ [STORAGE_KEYS.learningPanelByLecture]: next });
  }

  function refreshLearningPanelUI() {
    ensureLearningPanel();
    if (!runtimeState.learningPanelEl) {
      return;
    }

    const statusEl = runtimeState.learningPanelStatusEl;
    const contentEl = runtimeState.learningPanelContentEl;
    const generateBtn = runtimeState.learningPanelGenerateBtn;

    if (generateBtn) {
      generateBtn.disabled = runtimeState.learningPanelBusy;
      generateBtn.textContent = runtimeState.learningPanelEntry ? "Regenerate Panel" : "Generate Panel";
    }

    if (statusEl) {
      if (runtimeState.learningPanelBusy) {
        statusEl.textContent = "Generating learning panel...";
      } else if (runtimeState.learningPanelError) {
        statusEl.textContent = runtimeState.learningPanelError;
      } else if (runtimeState.learningPanelEntry) {
        statusEl.textContent = "Generated.";
      } else {
        statusEl.textContent = "Ready to generate.";
      }
    }

    if (!contentEl) {
      return;
    }

    if (!runtimeState.learningPanelEntry) {
      contentEl.innerHTML = "<p class='usg-learning-panel-note'>Click Generate Panel to create a summary, quiz, and code task.</p>";
      return;
    }

    const payload = runtimeState.learningPanelEntry.payload || {};
    const summary = payload.resumen || {};
    const quiz = Array.isArray(payload.cuestionario) ? payload.cuestionario : [];
    const codeTask = payload.code_task || {};

    const summaryHtml = [
      "<div class='usg-learning-panel-section active' data-tab='summary'>",
      "<h4>Resumen</h4>",
      summary.puntos_clave && Array.isArray(summary.puntos_clave)
        ? `<ul class='usg-keypoints'>${summary.puntos_clave.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
        : "",
      summary.explicacion ? `<p>${escapeHtml(summary.explicacion)}</p>` : "",
      summary.conceptos_complementarios && Array.isArray(summary.conceptos_complementarios)
        ? `<h5>Conceptos complementarios</h5><ul class='usg-keypoints'>${summary.conceptos_complementarios.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
        : "",
      "</div>"
    ].join("");

    const quizHtml = [
      "<div class='usg-learning-panel-section' data-tab='quiz'>",
      quiz.length
        ? quiz.map((item, idx) => {
          const opts = Array.isArray(item.opciones) ? item.opciones : [];
          const correct = String(item.respuesta_correcta || "").trim().toLowerCase();
          return [
            `<div class='usg-quiz-block'>`,
            `<strong>${idx + 1}. ${escapeHtml(item.pregunta || "")}</strong>`,
            `<div class='usg-quiz-options'>`,
            opts.map((opt) => {
              const normalized = String(opt || "").trim();
              const letter = normalized.slice(0, 1).toLowerCase();
              const isCorrect = letter === correct;
              return `<button type='button' data-quiz='true' data-correct='${isCorrect}' data-explain='${escapeHtml(item.explicacion || "")}'>${escapeHtml(normalized)}</button>`;
            }).join(""),
            "</div>",
            "<div class='usg-quiz-feedback'></div>",
            "</div>"
          ].join("");
        }).join("")
        : "<p class='usg-learning-panel-note'>No quiz items were generated.</p>",
      "</div>"
    ].join("");

    const applies = Boolean(codeTask.aplica);
    const codeHtml = [
      `<div class='usg-learning-panel-section' data-tab='code'>`,
      applies
        ? [
          `<h4>${escapeHtml(codeTask.titulo || "Code Task")}</h4>`,
          codeTask.descripcion ? `<p>${escapeHtml(codeTask.descripcion)}</p>` : "",
          codeTask.codigo_base ? `<pre><code>${escapeHtml(codeTask.codigo_base)}</code></pre>` : "",
          codeTask.solucion ? `<details><summary>Show solution</summary><pre><code>${escapeHtml(codeTask.solucion)}</code></pre></details>` : ""
        ].join("")
        : "<p class='usg-learning-panel-note'>No code task for this lecture.</p>",
      "</div>"
    ].join("");

    contentEl.innerHTML = summaryHtml + quizHtml + codeHtml;

    const tabButtons = runtimeState.learningPanelTabsEl ? runtimeState.learningPanelTabsEl.querySelectorAll("button[data-tab]") : [];
    tabButtons.forEach((btn) => {
      if (btn.dataset.tab === "code") {
        btn.style.display = applies ? "inline-flex" : "none";
      }
    });

    setLearningPanelTab("summary");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureCoursePanelStyle() {
    if (document.getElementById("usg-course-panel-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "usg-course-panel-style";
    style.textContent = [
      "#usg-course-panel {",
      "  position: fixed;",
      "  top: 88px;",
      "  right: 18px;",
      "  z-index: 2147483646;",
      "  font-family: 'Segoe UI', Tahoma, Arial, sans-serif;",
      "}",
      "#usg-course-panel .usg-course-panel-tab {",
      "  position: absolute;",
      "  top: 18px;",
      "  left: -100px;",
      "  width: 96px;",
      "  border: 1px solid #2f4f74;",
      "  background: #16324f;",
      "  color: #e8f3ff;",
      "  border-radius: 8px 0 0 8px;",
      "  padding: 8px 10px;",
      "  font-size: 11px;",
      "  font-weight: 600;",
      "  cursor: pointer;",
      "}",
      "#usg-course-panel .usg-course-panel-body {",
      "  width: 308px;",
      "  background: rgba(17, 24, 38, 0.96);",
      "  border: 1px solid #324865;",
      "  border-radius: 12px;",
      "  color: #e5ecf6;",
      "  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);",
      "  padding: 10px 11px;",
      "}",
      "#usg-course-panel.usg-collapsed .usg-course-panel-body {",
      "  display: none;",
      "}",
      "#usg-course-panel .usg-course-panel-header {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  gap: 8px;",
      "  margin-bottom: 8px;",
      "  font-size: 13px;",
      "}",
      "#usg-course-panel .usg-course-panel-collapse {",
      "  border: 1px solid #395678;",
      "  background: #15263a;",
      "  color: #cfe0f6;",
      "  border-radius: 6px;",
      "  width: 24px;",
      "  height: 24px;",
      "  cursor: pointer;",
      "}",
      "#usg-course-panel .usg-course-panel-status {",
      "  margin: 0 0 7px;",
      "  font-size: 12px;",
      "  line-height: 1.35;",
      "  color: #dce6f3;",
      "}",
      "#usg-course-panel .usg-course-panel-meta {",
      "  margin: 0 0 9px;",
      "  font-size: 11px;",
      "  color: #9fb3cd;",
      "}",
      "#usg-course-panel .usg-course-panel-controls {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  gap: 8px;",
      "}",
      "#usg-course-panel .usg-course-panel-switch {",
      "  display: inline-flex;",
      "  align-items: center;",
      "  gap: 6px;",
      "  font-size: 12px;",
      "  color: #dbe8fa;",
      "}",
      "#usg-course-panel .usg-course-panel-retry {",
      "  border: 1px solid #395678;",
      "  background: #1a3a59;",
      "  color: #e7f2ff;",
      "  border-radius: 7px;",
      "  font-size: 11px;",
      "  padding: 6px 8px;",
      "  cursor: pointer;",
      "}",
      "#usg-course-panel .usg-course-panel-retry:disabled {",
      "  opacity: 0.5;",
      "  cursor: default;",
      "}",
      "#usg-course-panel .usg-course-panel-flash {",
      "  margin: 8px 0 0;",
      "  min-height: 16px;",
      "  font-size: 11px;",
      "  color: #a9ffd9;",
      "}",
      "#usg-course-panel .usg-course-panel-flash.error {",
      "  color: #ffbdc7;",
      "}",
      "@media (max-width: 1020px) {",
      "  #usg-course-panel { right: 8px; top: 74px; }",
      "  #usg-course-panel .usg-course-panel-body { width: 266px; }",
      "  #usg-course-panel .usg-course-panel-tab { left: -90px; width: 86px; }",
      "}",
      "@media (max-width: 760px) {",
      "  #usg-course-panel { top: 64px; right: 6px; }",
      "  #usg-course-panel .usg-course-panel-body { width: min(250px, 88vw); }",
      "}"
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function setCoursePanelCollapsed(collapsed) {
    runtimeState.coursePanelCollapsed = Boolean(collapsed);
    const root = runtimeState.coursePanelEl || ensureCoursePanel();
    if (!root) {
      return;
    }

    root.classList.toggle("usg-collapsed", runtimeState.coursePanelCollapsed);
  }

  function setCoursePanelFlash(message, isError) {
    const el = runtimeState.coursePanelFlashEl;
    if (!el) {
      return;
    }

    el.textContent = String(message || "");
    if (isError) {
      el.classList.add("error");
    } else {
      el.classList.remove("error");
    }
  }

  function startCoursePanelStatusLoop() {
    if (runtimeState.coursePanelTimer != null) {
      return;
    }

    runtimeState.coursePanelTimer = setInterval(() => {
      refreshCoursePanelStatus().catch(() => {});
    }, 1800);
  }

  async function refreshCoursePanelStatus() {
    ensureCoursePanel();

    const status = await getStatus();
    if (runtimeState.coursePanelStatusEl) {
      runtimeState.coursePanelStatusEl.textContent = status.reason || "Ready.";
    }

    if (runtimeState.coursePanelMetaEl) {
      const enText = status.hasEnglish ? "Yes" : "No";
      const esText = status.autoTranslated ? "Yes" : "No";
      const enCues = Number(status.autoCueCount) || 0;
      const esCues = Number(status.importedCount) || 0;
      runtimeState.coursePanelMetaEl.textContent = `EN: ${enText} (${enCues}) | ES: ${esText} (${esCues})`;
    }

    if (runtimeState.coursePanelRetryBtn) {
      runtimeState.coursePanelRetryBtn.disabled = Boolean(status.hasNativeSpanish) || Boolean(status.autoTranslated);
    }

    if (runtimeState.coursePanelOverlayCheckbox) {
      runtimeState.coursePanelOverlayCheckbox.checked = Boolean(status.overlayEnabled);
      runtimeState.coursePanelOverlayCheckbox.disabled = !status.importedCount;
    }
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
      runtimeState.autoTranslatePromise = null;
      runtimeState.autoTranslateAttempt = 0;
      runtimeState.autoTranslateLastError = "";
      runtimeState.autoTranslatedForLecture = runtimeState.importedCues.length > 0;
      runtimeState.learningPanelEntry = await loadLearningPanelForCurrentLecture();
      runtimeState.learningPanelBusy = false;
      runtimeState.learningPanelError = "";
      if (runtimeState.autoRetryTimer != null) {
        clearTimeout(runtimeState.autoRetryTimer);
        runtimeState.autoRetryTimer = null;
      }
      if (runtimeState.autoDownloadRetryTimer != null) {
        clearTimeout(runtimeState.autoDownloadRetryTimer);
        runtimeState.autoDownloadRetryTimer = null;
      }
      if (runtimeState.autoTranslateRetryTimer != null) {
        clearTimeout(runtimeState.autoTranslateRetryTimer);
        runtimeState.autoTranslateRetryTimer = null;
      }
      startProactivePrefetch();
      startAutoEnglishPipeline();
      startAutoSpanishPipeline();
      applyOverlayVisibility();
      refreshCoursePanelStatus().catch(() => {});
      refreshLearningPanelUI();
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
    const autoTranslated = importedCount > 0;

    const canActions = !details.hasNativeSpanish;
    let reason = "";
    if (details.hasNativeSpanish) {
      reason = "Native ES captions detected. Export and import are disabled by rule.";
    } else if (autoTranslated) {
      reason = runtimeState.autoTranslatedForLecture
        ? `ES subtitles are loaded automatically (${importedCount} cues).`
        : `ES subtitles are loaded (${importedCount} cues).`;
    } else if (runtimeState.autoTranslatePromise) {
      reason = "Auto-translating EN subtitles to ES for this lecture...";
    } else if (runtimeState.autoTranslateLastError) {
      reason = `Auto translation failed (manual retry needed): ${runtimeState.autoTranslateLastError}`;
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
      autoAttempt: runtimeState.autoPipelineAttempt,
      autoTranslated,
      autoTranslateAttempt: runtimeState.autoTranslateAttempt,
      autoTranslateError: runtimeState.autoTranslateLastError
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

  async function getStudyTranscriptPayload(payload) {
    const maxCharsRaw = toFiniteNumber(payload.maxChars);
    const maxChars = clamp(Math.round(maxCharsRaw == null ? 18000 : maxCharsRaw), 3000, 60000);
    const preferImportedSpanish = Boolean(payload.preferImportedSpanish);

    let source = "";
    let language = "";
    let cues = [];

    if (preferImportedSpanish && runtimeState.importedCues.length >= 2) {
      source = "imported-es";
      language = "es";
      cues = runtimeState.importedCues;
    } else if (runtimeState.autoEnEntry && runtimeState.autoEnEntry.srt) {
      const parsed = parseSrt(runtimeState.autoEnEntry.srt);
      if (parsed.length >= 2) {
        source = "auto-en-cache";
        language = "en";
        cues = parsed;
      }
    }

    if (!cues.length && runtimeState.prefetchedEnCues.length >= 2) {
      source = runtimeState.prefetchInfo && runtimeState.prefetchInfo.mode
        ? runtimeState.prefetchInfo.mode
        : "prefetched";
      language = "en";
      cues = runtimeState.prefetchedEnCues;
    }

    if (!cues.length) {
      const extracted = await extractEnglishTimedCues({
        skipTranscript: false,
        skipTextTracks: false
      });
      source = extracted.mode || "extracted";
      language = "en";
      cues = extracted.cues || [];
    }

    const deduped = dedupeAndSortCues(cues);
    if (!deduped.length) {
      throw new Error("No subtitle cues available yet for study assistant.");
    }

    const textBuild = buildStudyTranscriptText(deduped, maxChars);
    if (!textBuild.text.trim()) {
      throw new Error("Transcript text is empty after filtering.");
    }

    return {
      lectureKey: runtimeState.lectureKey,
      courseSlug: getCourseSlugFromUrl(),
      lectureId: getLectureIdFromUrl(),
      source,
      language,
      cueCount: deduped.length,
      transcriptCharCount: textBuild.text.length,
      transcriptTruncated: textBuild.truncated,
      transcriptText: textBuild.text
    };
  }

  function buildStudyTranscriptText(cues, maxChars) {
    const lines = [];
    let used = 0;
    let truncated = false;
    let previous = "";

    for (const cue of cues) {
      const line = String((cue && cue.text) || "").replace(/\s+/g, " ").trim();
      if (!line) {
        continue;
      }
      if (line === previous) {
        continue;
      }
      previous = line;

      const extra = lines.length ? line.length + 1 : line.length;
      if (used + extra > maxChars) {
        truncated = true;
        break;
      }

      lines.push(line);
      used += extra;
    }

    return {
      text: lines.join("\n"),
      truncated
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

  function scheduleAutoSpanishRetry(delayMs) {
    if (runtimeState.autoTranslateRetryTimer != null) {
      return;
    }

    if (runtimeState.autoTranslateAttempt > 0) {
      return;
    }

    const safeDelay = clamp(Math.round(Number(delayMs) || 0), 1800, 20000);
    runtimeState.autoTranslateRetryTimer = setTimeout(() => {
      runtimeState.autoTranslateRetryTimer = null;
      startAutoSpanishPipeline();
    }, safeDelay);
  }

  async function retryAutoSpanishTranslation() {
    if (detectCaptionAvailability().hasNativeSpanish) {
      throw new Error("Native ES captions detected. Auto EN -> ES translation is disabled by rule.");
    }

    runtimeState.autoTranslatedForLecture = false;
    runtimeState.autoTranslateLastError = "";
    runtimeState.autoTranslateAttempt = 0;

    if (runtimeState.autoTranslateRetryTimer != null) {
      clearTimeout(runtimeState.autoTranslateRetryTimer);
      runtimeState.autoTranslateRetryTimer = null;
    }

    startAutoSpanishPipeline();
    return getStatus();
  }

  function startAutoSpanishPipeline() {
    if (runtimeState.autoTranslatePromise) {
      return;
    }

    if (runtimeState.autoTranslateRetryTimer != null) {
      clearTimeout(runtimeState.autoTranslateRetryTimer);
      runtimeState.autoTranslateRetryTimer = null;
    }

    if (detectCaptionAvailability().hasNativeSpanish) {
      return;
    }

    if (runtimeState.importedCues.length >= 2 || runtimeState.autoTranslatedForLecture) {
      runtimeState.autoTranslatedForLecture = runtimeState.importedCues.length > 0 || runtimeState.autoTranslatedForLecture;
      return;
    }

    if (!runtimeState.autoEnEntry || !runtimeState.autoEnEntry.srt) {
      if (runtimeState.autoPipelinePromise) {
        runtimeState.autoPipelinePromise.finally(() => {
          if (!runtimeState.importedCues.length && !detectCaptionAvailability().hasNativeSpanish) {
            startAutoSpanishPipeline();
          }
        });
        return;
      }
      scheduleAutoSpanishRetry(4200);
      return;
    }

    runtimeState.autoTranslatePromise = runAutoSpanishPipeline()
      .catch((error) => {
        runtimeState.autoTranslateLastError = toErrorMessage(error);
      })
      .finally(() => {
        runtimeState.autoTranslatePromise = null;
        // No automatic retries after a failed AI call. Use manual retry instead.
      });
  }

  async function runAutoSpanishPipeline() {
    if (detectCaptionAvailability().hasNativeSpanish) {
      return;
    }

    if (runtimeState.importedCues.length >= 2 || runtimeState.autoTranslatedForLecture) {
      runtimeState.autoTranslatedForLecture = runtimeState.importedCues.length > 0 || runtimeState.autoTranslatedForLecture;
      return;
    }

    runtimeState.autoTranslateAttempt = 1;

    let enEntry = runtimeState.autoEnEntry;
    if (!enEntry || !enEntry.srt) {
      const exported = await exportEnglishSrt();
      enEntry = {
        srt: String(exported.srt || ""),
        cueCount: Number(exported.cueCount) || 0,
        fileName: String(exported.fileName || "")
      };
    }

    const sourceSrt = String((enEntry && enEntry.srt) || "").trim();
    const sourceCueCount = Number((enEntry && enEntry.cueCount) || 0);
    if (!sourceSrt || sourceCueCount < 2) {
      throw new Error("No valid EN SRT available yet for automatic translation.");
    }

    const response = await sendMessageToExtension({
      type: "USG_TRANSLATE_EN_SRT_AUTO",
      srtText: sourceSrt,
      lectureKey: runtimeState.lectureKey,
      courseSlug: getCourseSlugFromUrl(),
      lectureId: getLectureIdFromUrl()
    });

    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Automatic EN->ES translation failed.");
    }

    const translatedSrt = String(response.srt || "").trim();
    const translatedCues = parseSrt(translatedSrt);
    if (translatedCues.length < 2) {
      throw new Error("Translated ES SRT could not be parsed.");
    }

    const allowedDelta = Math.max(4, Math.round(sourceCueCount * 0.25));
    const delta = Math.abs(translatedCues.length - sourceCueCount);
    if (sourceCueCount > 0 && delta > allowedDelta) {
      throw new Error(
        `Translated cue count mismatch (${translatedCues.length}/${sourceCueCount}).`
      );
    }

    await importSpanishSrt(translatedSrt, { source: "auto-ai" });
    runtimeState.autoTranslatedForLecture = true;
    runtimeState.autoTranslateLastError = "";
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

  async function importSpanishSrt(srtText, options) {
    const opts = options || {};

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
        source: String(opts.source || "manual"),
        importedAt: new Date().toISOString(),
        cues: parsed
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.subtitlesByLecture]: all });
    }

    runtimeState.lectureKey = key;
    runtimeState.importedCues = parsed;
    runtimeState.autoTranslatedForLecture = String(opts.source || "manual") === "auto-ai" || parsed.length > 0;
    runtimeState.autoTranslateLastError = "";
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
      source: String(opts.source || "manual"),
      suggestedFileName: buildSpanishFileName()
    };
  }

  async function clearImportedForCurrentLecture() {
    const key = getLectureKey();
    const all = await loadSubtitlesMap();
    delete all[key];
    await chrome.storage.local.set({ [STORAGE_KEYS.subtitlesByLecture]: all });

    runtimeState.importedCues = [];
    runtimeState.autoTranslatedForLecture = true;
    runtimeState.autoTranslateLastError = "";
    runtimeState.lastRenderedIndex = -1;
    runtimeState.lastRenderedText = "";

    if (runtimeState.autoTranslateRetryTimer != null) {
      clearTimeout(runtimeState.autoTranslateRetryTimer);
      runtimeState.autoTranslateRetryTimer = null;
    }

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
    startAutoSpanishPipeline();
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
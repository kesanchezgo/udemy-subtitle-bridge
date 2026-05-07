(function () {
  "use strict";

  const POPUP_STORAGE_KEYS = {
    esPasteDraftByLecture: "usg_popup_es_paste_draft_by_lecture_v1",
  };

  const els = {
    shell: document.querySelector(".usb-shell"),
    gearBtn: document.getElementById("gearBtn"),
    tabIndicator: document.querySelector(".usb-tab-indicator"),
    tabButtons: Array.from(document.querySelectorAll("[data-tab-button]")),
    tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
    courseSlug: document.getElementById("courseSlug"),
    lectureId: document.getElementById("lectureId"),
    hasEnglish: document.getElementById("hasEnglish"),
    hasSpanish: document.getElementById("hasSpanish"),
    importedCount: document.getElementById("importedCount"),
    prefetchMode: document.getElementById("prefetchMode"),
    prefetchedCount: document.getElementById("prefetchedCount"),
    autoDownloaded: document.getElementById("autoDownloaded"),
    autoTranslated: document.getElementById("autoTranslated"),
    statusReason: document.getElementById("statusReason"),
    refreshBtn: document.getElementById("refreshBtn"),
    retryAutoTranslateBtn: document.getElementById("retryAutoTranslateBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    clearBtn: document.getElementById("clearBtn"),
    fileInput: document.getElementById("fileInput"),
    pasteSrt: document.getElementById("pasteSrt"),
    pasteImportBtn: document.getElementById("pasteImportBtn"),
    studyObjective: document.getElementById("studyObjective"),
    studyLevel: document.getElementById("studyLevel"),
    studyLanguage: document.getElementById("studyLanguage"),
    studyGenerateBtn: document.getElementById("studyGenerateBtn"),
    studyStatus: document.getElementById("studyStatus"),
    studyOutput: document.getElementById("studyOutput"),
    studyLectureStat: document.getElementById("studyLectureStat"),
    studyCueStat: document.getElementById("studyCueStat"),
    overlayEnabled: document.getElementById("overlayEnabled"),
    offsetMs: document.getElementById("offsetMs"),
    fontSizePx: document.getElementById("fontSizePx"),
    opacity: document.getElementById("opacity"),
    overlayPosition: document.getElementById("overlayPosition"),
    overlayTextColor: document.getElementById("overlayTextColor"),
    overlayResetBtn: document.getElementById("overlayResetBtn"),
    overlayStatus: document.getElementById("overlayStatus"),
    pipelineCueCount: document.getElementById("pipelineCueCount"),
    pipelineLatency: document.getElementById("pipelineLatency"),
    pipelineApiState: document.getElementById("pipelineApiState"),
    pipelineStepCapture: document.getElementById("pipelineStepCapture"),
    pipelineStepAi: document.getElementById("pipelineStepAi"),
    pipelineStepOverlay: document.getElementById("pipelineStepOverlay"),
    pipelineSourceState: document.getElementById("pipelineSourceState"),
    pipelineImportState: document.getElementById("pipelineImportState"),
    pipelineOverlayState: document.getElementById("pipelineOverlayState"),
    flash: document.getElementById("flash"),
    devOutput: document.getElementById("devOutput"),
  };

  let activeTabId = null;
  let activeUiTabId = "study";
  let latestStatus = null;
  let draftLectureKey = "";
  let draftSaveTimer = null;
  let studyBusy = false;
  let devMode = false;
  let gearClickTimes = [];

  boot().catch((error) => {
    showError(toMessage(error));
  });

  async function boot() {
    activeTabId = await getActiveTabId();
    wireEvents();
    setupTabs();
    renderDevOutput();
    await refreshStatus();
    await syncPasteDraftWithStatus();
  }

  function wireEvents() {
    els.refreshBtn.addEventListener("click", async () => {
      try {
        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.retryAutoTranslateBtn.addEventListener("click", async () => {
      try {
        clearFlash();
        const response = await sendToContent({
          type: "USG_RETRY_AUTO_TRANSLATE",
        });
        if (!response || !response.ok) {
          throw new Error(
            (response && response.error) ||
              "Could not start auto translation retry.",
          );
        }
        if (response.status) {
          latestStatus = response.status;
          renderStatus(response.status);
        }
        showInfo("Auto EN -> ES translation retry started.");
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.exportBtn.addEventListener("click", async () => {
      try {
        clearFlash();
        const response = await sendToContent({ type: "USG_EXPORT_EN_SRT" });
        if (!response.ok) {
          throw new Error(response.error || "Failed to export EN SRT.");
        }

        downloadTextFile(
          response.fileName || "udemy_en.srt",
          response.srt || "",
        );
        const message = `Exported ${response.cueCount || 0} cues (${response.extractionMode || "unknown"}).`;
        if (response.warning) {
          showInfo(`${message} ${response.warning}`);
        } else {
          showInfo(message);
        }
        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.importBtn.addEventListener("click", () => {
      clearFlash();
      els.fileInput.click();
    });

    els.fileInput.addEventListener("change", async (event) => {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const response = await sendToContent({
          type: "USG_IMPORT_ES_SRT",
          srtText: text,
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to import ES SRT.");
        }

        if (response.alreadyLoaded) {
          showInfo(
            `ES subtitles were already loaded for this lecture (${response.importedCount || 0} cues).`,
          );
        } else {
          showInfo(`Imported ${response.importedCount || 0} cues.`);
        }
        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      } finally {
        input.value = "";
      }
    });

    els.pasteSrt.addEventListener("input", () => {
      scheduleSavePasteDraft();
    });

    els.pasteImportBtn.addEventListener("click", async () => {
      const text = String(els.pasteSrt.value || "");
      if (!text.trim()) {
        showError("Paste ES SRT content first.");
        return;
      }

      try {
        clearFlash();
        const response = await sendToContent({
          type: "USG_IMPORT_ES_SRT",
          srtText: text,
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to import pasted ES SRT.");
        }

        await savePasteDraftForCurrentLecture(text);

        if (response.suggestedFileName && !response.alreadyLoaded) {
          downloadTextFile(response.suggestedFileName, text);
        }

        if (response.alreadyLoaded) {
          showInfo(
            `ES subtitles were already loaded for this lecture (${response.importedCount || 0} cues).`,
          );
        } else {
          showInfo(
            `Imported ${response.importedCount || 0} cues from pasted text.`,
          );
        }

        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    if (els.overlayPosition) {
      els.overlayPosition.addEventListener("change", () => {
        pushOverlaySettings(false);
      });
    }

    if (els.overlayTextColor) {
      els.overlayTextColor.addEventListener("change", () => {
        pushOverlaySettings(false);
      });
    }

    if (els.overlayResetBtn) {
      els.overlayResetBtn.addEventListener("click", async () => {
        if (els.offsetMs) {
          els.offsetMs.value = "0";
        }
        if (els.fontSizePx) {
          els.fontSizePx.value = "32";
        }
        if (els.opacity) {
          els.opacity.value = "0.86";
        }
        if (els.overlayPosition) {
          els.overlayPosition.value = "bottom";
        }
        if (els.overlayTextColor) {
          els.overlayTextColor.value = "white";
        }
        await pushOverlaySettings(true);
      });
    }

    els.studyGenerateBtn.addEventListener("click", async () => {
      if (studyBusy) {
        return;
      }
      try {
        await generateStudyGuide();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.clearBtn.addEventListener("click", async () => {
      try {
        clearFlash();
        const response = await sendToContent({
          type: "USG_CLEAR_IMPORTED_FOR_LECTURE",
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to clear imported cues.");
        }
        showInfo("Imported ES cues removed for this lecture.");
        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.overlayEnabled.addEventListener("change", async () => {
      try {
        const response = await sendToContent({
          type: "USG_SET_OVERLAY_ENABLED",
          enabled: els.overlayEnabled.checked,
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to set overlay state.");
        }
        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

    els.offsetMs.addEventListener("input", () => {
      pushOverlaySettings(false);
    });
    els.offsetMs.addEventListener("change", () => {
      pushOverlaySettings(true);
    });

    els.fontSizePx.addEventListener("input", () => {
      pushOverlaySettings(false);
    });
    els.fontSizePx.addEventListener("change", () => {
      pushOverlaySettings(true);
    });

    els.opacity.addEventListener("input", () => {
      pushOverlaySettings(false);
    });
    els.opacity.addEventListener("change", () => {
      pushOverlaySettings(true);
    });

    if (els.gearBtn) {
      els.gearBtn.addEventListener("click", () => {
        const now = Date.now();
        gearClickTimes = gearClickTimes.filter(
          (timestamp) => now - timestamp <= 1000,
        );
        gearClickTimes.push(now);
        if (gearClickTimes.length >= 3) {
          gearClickTimes = [];
          setDevMode(!devMode);
        }
      });
    }

    window.addEventListener("resize", () => {
      syncTabIndicator(activeUiTabId);
    });
  }

  function setupTabs() {
    if (!els.tabButtons.length || !els.tabPanels.length) {
      return;
    }

    for (const button of els.tabButtons) {
      button.addEventListener("click", () => {
        const target = String(
          button.getAttribute("data-tab-button") || "study",
        );
        if (target === "dev" && !devMode) {
          return;
        }
        setActiveTab(target);
      });
    }

    setActiveTab("study");
  }

  function setActiveTab(tabId) {
    activeUiTabId = tabId;

    for (const button of els.tabButtons) {
      const isActive =
        String(button.getAttribute("data-tab-button") || "") === tabId;
      button.classList.toggle("is-active", isActive);
    }

    for (const panel of els.tabPanels) {
      const isActive =
        String(panel.getAttribute("data-tab-panel") || "") === tabId;
      panel.classList.toggle("is-active", isActive);
    }

    syncTabIndicator(tabId);
  }

  function syncTabIndicator(tabId) {
    if (!els.tabIndicator) {
      return;
    }

    const activeButton = els.tabButtons.find((button) => {
      return String(button.getAttribute("data-tab-button") || "") === tabId;
    });

    if (!activeButton || !activeButton.parentElement) {
      els.tabIndicator.style.opacity = "0";
      return;
    }

    const left = activeButton.offsetLeft;
    const width = activeButton.offsetWidth;

    els.tabIndicator.style.opacity = "1";
    els.tabIndicator.style.width = `${width}px`;
    els.tabIndicator.style.transform = `translateX(${left}px)`;
  }

  function setDevMode(enabled) {
    devMode = Boolean(enabled);
    document.body.classList.toggle("dev-mode", devMode);

    if (
      !devMode &&
      els.tabButtons.some(
        (button) =>
          button.classList.contains("is-active") &&
          button.getAttribute("data-tab-button") === "dev",
      )
    ) {
      setActiveTab("study");
    }

    renderDevOutput();
  }

  function renderDevOutput() {
    if (!els.devOutput) {
      return;
    }

    const payload = {
      devMode,
      activeTabId,
      activeUiTabId,
      studyBusy,
      lecture: latestStatus
        ? {
            courseSlug: latestStatus.courseSlug,
            lectureId: latestStatus.lectureId,
            hasEnglish: latestStatus.hasEnglish,
            hasSpanish: latestStatus.hasNativeSpanish,
            importedCount: latestStatus.importedCount,
            prefetchedCount: latestStatus.prefetchedCueCount,
            overlayEnabled: latestStatus.overlayEnabled,
          }
        : null,
    };

    els.devOutput.textContent = JSON.stringify(payload, null, 2);
  }

  async function pushOverlaySettings(refreshAfter = false) {
    try {
      const response = await sendToContent({
        type: "USG_SET_OVERLAY_SETTINGS",
        offsetMs: Number(els.offsetMs.value),
        fontSizePx: Number(els.fontSizePx.value),
        opacity: Number(els.opacity.value),
        overlayPosition: String(
          (els.overlayPosition && els.overlayPosition.value) || "bottom",
        ),
        overlayTextColor: String(
          (els.overlayTextColor && els.overlayTextColor.value) || "white",
        ),
      });
      if (!response.ok) {
        throw new Error(response.error || "Failed to update overlay settings.");
      }

      if (response.status) {
        latestStatus = response.status;
        renderStatus(response.status);
      }

      if (refreshAfter) {
        await refreshStatus(false);
      }
    } catch (error) {
      showError(toMessage(error));
    }
  }

  async function refreshStatus(showFlashOnError = true) {
    clearFlash();
    try {
      const response = await sendToContent({ type: "USG_GET_STATUS" });
      if (!response.ok) {
        throw new Error(response.error || "Could not read status.");
      }

      latestStatus = response.status;
      renderStatus(latestStatus);
      await syncPasteDraftWithStatus();
    } catch (error) {
      if (showFlashOnError) {
        showError(toMessage(error));
      }
      disableActions(true);
    }
  }

  function renderStatus(status) {
    els.courseSlug.textContent = status.courseSlug || "-";
    els.lectureId.textContent = status.lectureId || "-";
    els.hasEnglish.textContent = status.hasEnglish ? "Yes" : "No";
    els.hasSpanish.textContent = status.hasNativeSpanish ? "Yes" : "No";
    els.importedCount.textContent = String(status.importedCount || 0);
    els.prefetchMode.textContent = status.prefetchMode || "-";
    els.prefetchedCount.textContent = String(status.prefetchedCueCount || 0);
    els.autoDownloaded.textContent = status.autoDownloaded ? "Yes" : "No";
    els.autoTranslated.textContent = status.autoTranslated ? "Yes" : "No";
    els.statusReason.textContent = status.reason || "Ready.";

    if (!studyBusy) {
      const lectureText = status.lectureId
        ? `Lecture ${status.lectureId}`
        : "Current lecture";
      els.studyStatus.textContent = `Uses transcript from ${lectureText}.`;
    }

    if (els.studyLectureStat) {
      els.studyLectureStat.textContent = status.lectureId
        ? `Lecture ${status.lectureId}`
        : "Current lecture";
    }

    if (els.studyCueStat) {
      els.studyCueStat.textContent = `${status.prefetchedCueCount || 0} cues`;
    }

    updatePipelineState(status);

    const canActions = Boolean(status.canActions);
    disableActions(!canActions);

    els.overlayEnabled.checked = Boolean(status.overlayEnabled);
    if (status.settings) {
      const offsetValue = Number(status.settings.offsetMs);
      const safeOffset = Number.isFinite(offsetValue)
        ? Math.max(-15000, Math.min(15000, Math.round(offsetValue)))
        : 0;
      els.offsetMs.value = String(safeOffset);
      els.fontSizePx.value = String(status.settings.fontSizePx || 32);
      els.opacity.value = String(status.settings.opacity || 0.86);
      if (els.overlayPosition) {
        els.overlayPosition.value = String(
          status.settings.overlayPosition || "bottom",
        );
      }
      if (els.overlayTextColor) {
        els.overlayTextColor.value = String(
          status.settings.overlayTextColor || "white",
        );
      }
    }

    if (els.overlayStatus) {
      els.overlayStatus.textContent = status.overlayEnabled
        ? `Overlay live · ${status.settings && status.settings.overlayPosition ? status.settings.overlayPosition : "bottom"} · ${status.settings && status.settings.overlayTextColor ? status.settings.overlayTextColor : "white"}`
        : "Overlay disabled.";
    }

    renderDevOutput();
  }

  function updatePipelineState(status) {
    const cueCount = Number(
      status.prefetchedCueCount || status.importedCount || 0,
    );
    if (els.pipelineCueCount) {
      els.pipelineCueCount.textContent = `${cueCount} cues`;
    }
    if (els.pipelineLatency) {
      els.pipelineLatency.textContent = status.autoDownloaded
        ? "Network VTT"
        : status.prefetchMode || "Idle";
    }
    if (els.pipelineApiState) {
      els.pipelineApiState.textContent = status.autoDownloaded
        ? "Conectada"
        : status.prefetchMode || "Idle";
    }
    if (els.pipelineSourceState) {
      els.pipelineSourceState.textContent = status.autoDownloaded
        ? "Network VTT"
        : status.prefetchMode || "Waiting";
    }
    if (els.pipelineImportState) {
      els.pipelineImportState.textContent = `${status.importedCount || 0} cues`;
    }
    if (els.pipelineOverlayState) {
      els.pipelineOverlayState.textContent = status.overlayEnabled
        ? "On"
        : "Off";
    }

    setPipelineStep(
      els.pipelineStepCapture,
      Boolean(status.hasEnglish || status.autoDownloaded),
      Boolean(status.autoDownloaded || status.hasEnglish),
    );
    setPipelineStep(
      els.pipelineStepAi,
      Boolean(status.autoTranslated || status.importedCount),
      Boolean(status.autoTranslated || status.importedCount),
    );
    setPipelineStep(
      els.pipelineStepOverlay,
      Boolean(
        status.overlayEnabled &&
        (status.importedCount || status.autoTranslated),
      ),
      Boolean(
        status.overlayEnabled &&
        (status.importedCount || status.autoTranslated),
      ),
    );
  }

  function setPipelineStep(element, complete, live) {
    if (!element) {
      return;
    }
    element.classList.toggle("is-complete", Boolean(complete));
    element.classList.toggle("is-live", Boolean(live) && !complete);
  }

  function disableActions(disabled) {
    els.retryAutoTranslateBtn.disabled = disabled;
    els.exportBtn.disabled = disabled;
    els.importBtn.disabled = disabled;
    els.pasteImportBtn.disabled = disabled;
    els.pasteSrt.disabled = disabled;
  }

  async function generateStudyGuide() {
    clearFlash();
    setStudyBusy(true, "Collecting transcript from current lecture...");

    try {
      const transcriptResponse = await sendToContent({
        type: "USG_GET_STUDY_TRANSCRIPT",
        maxChars: 22000,
        preferImportedSpanish: false,
      });

      if (!transcriptResponse || !transcriptResponse.ok) {
        throw new Error(
          (transcriptResponse && transcriptResponse.error) ||
            "Could not collect transcript.",
        );
      }

      const transcriptText = String(
        transcriptResponse.transcriptText || "",
      ).trim();
      if (transcriptText.length < 80) {
        throw new Error(
          "Transcript is too short. Play the lecture a bit longer and try again.",
        );
      }

      const level = String(els.studyLevel.value || "intermediate");
      const outputLanguage = String(els.studyLanguage.value || "es");
      const objective = String(
        els.studyObjective && els.studyObjective.value
          ? els.studyObjective.value
          : "",
      ).trim();
      const prompt = buildStudyPrompt(
        transcriptResponse,
        level,
        outputLanguage,
        objective,
      );

      setStudyBusy(
        true,
        "Generating explanation, examples and quiz with Gemini...",
      );
      const reply = await requestStudyReply(prompt);
      const parsed = parseStudyReply(reply);
      renderStudyOutput(parsed, transcriptResponse, reply, outputLanguage);

      const truncation = transcriptResponse.transcriptTruncated
        ? " (truncated transcript)"
        : "";
      showInfo(
        `Study guide generated from ${transcriptResponse.cueCount || 0} cues${truncation}.`,
      );
    } catch (error) {
      els.studyOutput.textContent = `Study agent error: ${toMessage(error)}`;
      throw error;
    } finally {
      setStudyBusy(false);
    }
  }

  function setStudyBusy(busy, statusText) {
    studyBusy = Boolean(busy);
    els.studyGenerateBtn.disabled = studyBusy;

    if (statusText) {
      els.studyStatus.textContent = statusText;
      return;
    }

    if (latestStatus && latestStatus.lectureId) {
      els.studyStatus.textContent = `Uses transcript from Lecture ${latestStatus.lectureId}.`;
    } else {
      els.studyStatus.textContent = "Uses the current lecture transcript.";
    }
  }

  function buildStudyPrompt(
    transcriptPayload,
    level,
    outputLanguage,
    objective,
  ) {
    const languageLabel = outputLanguage === "en" ? "English" : "Spanish";
    const levelLabelMap = {
      beginner: "simple and guided",
      intermediate: "clear and practical",
      advanced: "rigorous and interview-ready",
    };
    const levelLabel = levelLabelMap[level] || levelLabelMap.intermediate;
    const transcript = String(transcriptPayload.transcriptText || "").trim();
    const courseName =
      latestStatus && latestStatus.courseSlug
        ? latestStatus.courseSlug
        : "unknown";
    const lessonName =
      latestStatus && latestStatus.lectureId
        ? latestStatus.lectureId
        : "current lecture";

    return [
      "You are an expert in instructional design and programming pedagogy.",
      `Responde en ${languageLabel} y devuelve ÚNICAMENTE JSON válido, sin markdown ni texto extra.`,
      `Ajusta la profundidad al nivel \"${level}\" (${levelLabel}).`,
      objective
        ? `Objetivo de la sesión: ${objective}`
        : "Objetivo de la sesión: resumir y enseñar la lección actual con utilidad práctica.",
      "Usa el esquema JSON EXACTO:",
      '{"relevance":{"score":<0-100>,"reason":"<string>"},"keyConcepts":["<string>"],"quickWin":"<string>","questions":[{"q":"<string>","bloom":"<recordar|comprender|aplicar|analizar|evaluar|crear>","difficulty":"<confused|partial|clear|mastered>","hint":"<string>","answer":"<string>"}],"application":{"isCode":<boolean>,"setup":"<string>","challenge":"<string>","solution":"<string>"},"interviewQ":{"q":"<string>","idealAnswer":"<string>"},"nextAction":"<string>","ankiCards":[{"id":"<string>","type":"<concepto|codigo|entrevista|comparacion|proceso>","front":"<HTML>","back":"<HTML>","tags":["<tag1>","<tag2>"]}]}',
      "Reglas:",
      "- Genera exactamente 4 preguntas: una por dificultad (confused, partial, clear, mastered)",
      "- Genera exactamente 5-6 tarjetas Anki, con HTML válido en front/back",
      "- Las tags deben incluir el curso, el tema y el tipo de objetivo",
      "- Mantén la respuesta en un JSON limpio y parsable",
      "Lecture metadata:",
      `- source=${transcriptPayload.source || "unknown"}`,
      `- cue_count=${transcriptPayload.cueCount || 0}`,
      `- course=${courseName}`,
      `- lesson=${lessonName}`,
      objective ? `- objective=${objective}` : "- objective=general study",
      "Transcript:",
      transcript,
    ].join("\n\n");
  }

  async function requestStudyReply(prompt) {
    return requestGeminiReply(prompt, 0.5, 2000);
  }

  function parseStudyReply(replyText) {
    const direct = safeJsonParse(replyText);
    if (direct && typeof direct === "object") {
      return direct;
    }

    const fenced =
      String(replyText || "").match(/```json\s*([\s\S]*?)```/i) ||
      String(replyText || "").match(/```\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      const fromFence = safeJsonParse(fenced[1]);
      if (fromFence && typeof fromFence === "object") {
        return fromFence;
      }
    }

    const text = String(replyText || "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = text.slice(start, end + 1);
      const fromSlice = safeJsonParse(sliced);
      if (fromSlice && typeof fromSlice === "object") {
        return fromSlice;
      }
    }

    return null;
  }

  function renderStudyOutput(
    parsed,
    transcriptPayload,
    rawReply,
    outputLanguage,
  ) {
    const languageLabel = outputLanguage === "en" ? "English" : "Spanish";
    const lines = [];
    lines.push(`Output language: ${languageLabel}`);
    lines.push(`Source: ${transcriptPayload.source || "unknown"}`);
    lines.push(`Cue count: ${transcriptPayload.cueCount || 0}`);
    if (transcriptPayload.transcriptTruncated) {
      lines.push("Transcript note: truncated to stay within API prompt size.");
    }
    lines.push("");

    if (!parsed) {
      lines.push("AI response (unstructured):");
      lines.push(String(rawReply || ""));
      els.studyOutput.textContent = lines.join("\n");
      els.studyStatus.textContent =
        "Generated, but model did not return strict JSON.";
      return;
    }

    const relevance =
      parsed.relevance && typeof parsed.relevance === "object"
        ? parsed.relevance
        : null;
    const keyConcepts = toStringArray(
      firstValue(parsed, [
        "keyConcepts",
        "key_concepts",
        "key_points",
        "keyPoints",
        "main_points",
      ]),
    );
    const quickWin = firstString(parsed, [
      "quickWin",
      "quick_win",
      "quick_tip",
      "nextAction",
    ]);
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const application =
      parsed.application && typeof parsed.application === "object"
        ? parsed.application
        : null;
    const interviewQ =
      parsed.interviewQ && typeof parsed.interviewQ === "object"
        ? parsed.interviewQ
        : null;
    const ankiCards = Array.isArray(parsed.ankiCards) ? parsed.ankiCards : [];

    if (relevance) {
      const score = Number(relevance.score);
      lines.push(`Relevance: ${Number.isFinite(score) ? score : "?"}/100`);
      if (relevance.reason) {
        lines.push(String(relevance.reason));
      }
      lines.push("");
    }

    lines.push("Key concepts");
    if (keyConcepts.length) {
      for (let i = 0; i < keyConcepts.length; i += 1) {
        lines.push(`${i + 1}. ${keyConcepts[i]}`);
      }
    } else {
      lines.push("No key concepts returned.");
    }
    lines.push("");

    lines.push("Quick win");
    lines.push(quickWin || "No quick win returned.");
    lines.push("");

    lines.push("Questions");
    if (questions.length) {
      for (let i = 0; i < questions.length; i += 1) {
        const item = questions[i] || {};
        const bloom = item.bloom ? ` [${String(item.bloom)}]` : "";
        const difficulty = item.difficulty
          ? ` (${String(item.difficulty)})`
          : "";
        lines.push(
          `${i + 1}. ${item.q || item.question || "Question not available"}${bloom}${difficulty}`,
        );
        if (item.hint) {
          lines.push(`   Hint: ${item.hint}`);
        }
        if (item.answer) {
          lines.push(`   Answer: ${item.answer}`);
        }
      }
    } else {
      lines.push("No questions returned.");
    }
    lines.push("");

    lines.push("Application");
    if (application) {
      lines.push(`Type: ${application.isCode ? "code" : "scenario"}`);
      if (application.setup) {
        lines.push(`Setup: ${application.setup}`);
      }
      if (application.challenge) {
        lines.push(`Challenge: ${application.challenge}`);
      }
      if (application.solution) {
        lines.push(`Solution: ${application.solution}`);
      }
    } else {
      lines.push("No application block returned.");
    }
    lines.push("");

    lines.push("Interview question");
    if (interviewQ) {
      lines.push(interviewQ.q || "No interview question returned.");
      if (interviewQ.idealAnswer) {
        lines.push(`Ideal answer: ${interviewQ.idealAnswer}`);
      }
    } else {
      lines.push("No interview question returned.");
    }
    lines.push("");

    lines.push("Next action");
    lines.push(
      firstString(parsed, ["nextAction", "next_action"]) ||
        "No next action returned.",
    );
    lines.push("");

    lines.push("Anki cards");
    if (ankiCards.length) {
      lines.push(`Generated cards: ${ankiCards.length}`);
      for (let i = 0; i < ankiCards.length; i += 1) {
        const card = ankiCards[i] || {};
        lines.push(`${i + 1}. ${card.type || "card"} - ${card.id || "no-id"}`);
        if (card.tags && Array.isArray(card.tags) && card.tags.length) {
          lines.push(`   Tags: ${card.tags.join(", ")}`);
        }
      }
    } else {
      lines.push("No Anki cards returned.");
    }

    if (
      !relevance &&
      !keyConcepts.length &&
      !questions.length &&
      !ankiCards.length
    ) {
      const explanation = firstString(parsed, [
        "simplified_explanation",
        "simple_explanation",
        "explanation",
      ]);
      const examples = normalizeExamples(
        firstValue(parsed, ["examples", "practice_examples", "real_examples"]),
      );
      const quiz = normalizeQuiz(
        firstValue(parsed, ["mini_quiz", "quiz", "questions"]),
      );

      lines.push("");
      lines.push("Simple explanation");
      lines.push(explanation || "No explanation returned.");
      lines.push("");

      lines.push("Examples");
      if (examples.length) {
        for (let i = 0; i < examples.length; i += 1) {
          const item = examples[i];
          lines.push(
            `${i + 1}. ${item.concept || "Concept"}: ${item.example || "-"}`,
          );
          if (item.why) {
            lines.push(`   Why it matters: ${item.why}`);
          }
        }
      } else {
        lines.push("No examples returned.");
      }
      lines.push("");

      lines.push("Mini quiz");
      if (quiz.length) {
        for (let i = 0; i < quiz.length; i += 1) {
          const item = quiz[i];
          lines.push(`${i + 1}. ${item.question || "Question not available"}`);
          for (const option of item.options) {
            lines.push(`   ${option}`);
          }
          if (item.answer) {
            lines.push(`   Answer: ${item.answer}`);
          }
          if (item.explanation) {
            lines.push(`   Explanation: ${item.explanation}`);
          }
        }
      } else {
        lines.push("No quiz questions returned.");
      }
    }

    els.studyOutput.textContent = lines.join("\n");
    els.studyStatus.textContent = "Study guide generated successfully.";
    renderDevOutput();
  }

  async function requestGeminiReply(prompt, temperature, maxOutputTokens) {
    const apiKeys = getGeminiApiKeys();
    const model = getGeminiModel();
    if (!apiKeys.length) {
      throw new Error("No Gemini API keys configured.");
    }

    let lastError = null;

    for (const apiKey of apiKeys) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                temperature,
                maxOutputTokens,
              },
            }),
          },
        );

        const responseText = await response.text();
        const parsed = safeJsonParse(responseText);
        if (!response.ok) {
          const detail =
            parsed && parsed.error && parsed.error.message
              ? String(parsed.error.message)
              : String(responseText || "Gemini request failed").slice(0, 260);
          throw new Error(`HTTP ${response.status}: ${detail}`);
        }

        const reply = extractGeminiText(parsed);
        if (!reply) {
          throw new Error("Gemini returned an empty reply.");
        }

        return reply;
      } catch (error) {
        lastError = new Error(toMessage(error));
      }
    }

    throw lastError || new Error("Could not connect to Gemini API.");
  }

  function getGeminiApiKeys() {
    const keys = Array.isArray(globalThis.USB_GEMINI_API_KEYS)
      ? globalThis.USB_GEMINI_API_KEYS
      : [];
    return keys.map((key) => String(key || "").trim()).filter(Boolean);
  }

  function getGeminiModel() {
    const model = String(
      globalThis.USB_GEMINI_MODEL || "gemini-2.0-flash",
    ).trim();
    return model || "gemini-2.0-flash";
  }

  function extractGeminiText(payload) {
    const parts =
      payload &&
      Array.isArray(payload.candidates) &&
      payload.candidates[0] &&
      payload.candidates[0].content &&
      Array.isArray(payload.candidates[0].content.parts)
        ? payload.candidates[0].content.parts
        : [];

    return parts
      .map((part) => String(part && part.text ? part.text : ""))
      .join("")
      .trim();
  }

  function firstString(source, keys) {
    for (const key of keys) {
      if (!source || typeof source !== "object") {
        return "";
      }
      const value = source[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  function firstValue(source, keys) {
    if (!source || typeof source !== "object") {
      return null;
    }
    for (const key of keys) {
      if (key in source) {
        return source[key];
      }
    }
    return null;
  }

  function toStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => String(item == null ? "" : item).trim())
      .filter(Boolean);
  }

  function normalizeExamples(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === "string") {
          return {
            concept: "",
            example: item.trim(),
            why: "",
          };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const concept = String(
          item.concept || item.topic || item.title || "",
        ).trim();
        const example = String(
          item.example || item.content || item.text || "",
        ).trim();
        const why = String(
          item.why_it_matters || item.why || item.reason || "",
        ).trim();
        if (!concept && !example && !why) {
          return null;
        }
        return { concept, example, why };
      })
      .filter(Boolean);
  }

  function normalizeQuiz(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const question = String(item.question || item.q || "").trim();
        const optionsRaw = Array.isArray(item.options)
          ? item.options
          : Array.isArray(item.choices)
            ? item.choices
            : [];
        const options = optionsRaw
          .map((opt) => String(opt == null ? "" : opt).trim())
          .filter(Boolean)
          .slice(0, 4);
        const answer = String(item.answer || item.correct || "").trim();
        const explanation = String(
          item.explanation || item.reason || "",
        ).trim();

        if (!question && !options.length) {
          return null;
        }

        return {
          question,
          options,
          answer,
          explanation,
        };
      })
      .filter(Boolean);
  }

  function safeJsonParse(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return null;
    }
  }

  function downloadTextFile(fileName, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function getActiveTabId() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== "number") {
      throw new Error("No active tab found.");
    }
    if (!tab.url || !tab.url.startsWith("https://www.udemy.com/")) {
      throw new Error("Open a Udemy lecture page first.");
    }
    return tab.id;
  }

  function sendToContent(message) {
    return new Promise((resolve, reject) => {
      if (!Number.isInteger(activeTabId)) {
        reject(new Error("Active tab is not available."));
        return;
      }
      chrome.tabs.sendMessage(activeTabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Could not reach content script."));
          return;
        }
        resolve(
          response || { ok: false, error: "No response from content script." },
        );
      });
    });
  }

  function showInfo(message) {
    els.flash.textContent = message;
    els.flash.classList.remove("error");
  }

  function showError(message) {
    els.flash.textContent = message;
    els.flash.classList.add("error");
  }

  function clearFlash() {
    els.flash.textContent = "";
    els.flash.classList.remove("error");
  }

  function scheduleSavePasteDraft() {
    if (draftSaveTimer != null) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      savePasteDraftForCurrentLecture(String(els.pasteSrt.value || "")).catch(
        () => {},
      );
    }, 260);
  }

  async function syncPasteDraftWithStatus() {
    const lectureKey =
      latestStatus && latestStatus.lectureKey
        ? String(latestStatus.lectureKey)
        : "";
    if (!lectureKey) {
      draftLectureKey = "";
      els.pasteSrt.value = "";
      return;
    }

    if (draftLectureKey === lectureKey) {
      return;
    }

    draftLectureKey = lectureKey;
    const map = await loadPasteDraftMap();
    els.pasteSrt.value = String(map[lectureKey] || "");
  }

  async function savePasteDraftForCurrentLecture(text) {
    const lectureKey =
      latestStatus && latestStatus.lectureKey
        ? String(latestStatus.lectureKey)
        : "";
    if (!lectureKey) {
      return;
    }

    const map = await loadPasteDraftMap();
    if (String(text || "").trim()) {
      map[lectureKey] = String(text || "");
    } else {
      delete map[lectureKey];
    }

    await chrome.storage.local.set({
      [POPUP_STORAGE_KEYS.esPasteDraftByLecture]: map,
    });
  }

  async function loadPasteDraftMap() {
    const data = await chrome.storage.local.get(
      POPUP_STORAGE_KEYS.esPasteDraftByLecture,
    );
    const map = data && data[POPUP_STORAGE_KEYS.esPasteDraftByLecture];
    if (!map || typeof map !== "object") {
      return {};
    }
    return map;
  }

  function toMessage(error) {
    if (!error) {
      return "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    return error.message || String(error);
  }
})();

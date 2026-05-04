(function () {
  "use strict";

  const POPUP_STORAGE_KEYS = {
    esPasteDraftByLecture: "usg_popup_es_paste_draft_by_lecture_v1"
  };

  const STUDY_API_BASES = [
    "http://127.0.0.1:8010",
    "http://localhost:8010"
  ];

  const els = {
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
    studyLevel: document.getElementById("studyLevel"),
    studyLanguage: document.getElementById("studyLanguage"),
    studyGenerateBtn: document.getElementById("studyGenerateBtn"),
    studyStatus: document.getElementById("studyStatus"),
    studyOutput: document.getElementById("studyOutput"),
    overlayEnabled: document.getElementById("overlayEnabled"),
    offsetMs: document.getElementById("offsetMs"),
    fontSizePx: document.getElementById("fontSizePx"),
    opacity: document.getElementById("opacity"),
    flash: document.getElementById("flash")
  };

  let activeTabId = null;
  let latestStatus = null;
  let draftLectureKey = "";
  let draftSaveTimer = null;
  let studyBusy = false;
  let preferredStudyApiBase = "";

  boot().catch((error) => {
    showError(toMessage(error));
  });

  async function boot() {
    activeTabId = await getActiveTabId();
    wireEvents();
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
        const response = await sendToContent({ type: "USG_RETRY_AUTO_TRANSLATE" });
        if (!response || !response.ok) {
          throw new Error((response && response.error) || "Could not start auto translation retry.");
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

        downloadTextFile(response.fileName || "udemy_en.srt", response.srt || "");
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
          srtText: text
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to import ES SRT.");
        }

        if (response.alreadyLoaded) {
          showInfo(`ES subtitles were already loaded for this lecture (${response.importedCount || 0} cues).`);
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
          srtText: text
        });
        if (!response.ok) {
          throw new Error(response.error || "Failed to import pasted ES SRT.");
        }

        await savePasteDraftForCurrentLecture(text);

        if (response.suggestedFileName && !response.alreadyLoaded) {
          downloadTextFile(response.suggestedFileName, text);
        }

        if (response.alreadyLoaded) {
          showInfo(`ES subtitles were already loaded for this lecture (${response.importedCount || 0} cues).`);
        } else {
          showInfo(`Imported ${response.importedCount || 0} cues from pasted text.`);
        }

        await refreshStatus();
      } catch (error) {
        showError(toMessage(error));
      }
    });

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
        const response = await sendToContent({ type: "USG_CLEAR_IMPORTED_FOR_LECTURE" });
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
          enabled: els.overlayEnabled.checked
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
  }

  async function pushOverlaySettings(refreshAfter = false) {
    try {
      const response = await sendToContent({
        type: "USG_SET_OVERLAY_SETTINGS",
        offsetMs: Number(els.offsetMs.value),
        fontSizePx: Number(els.fontSizePx.value),
        opacity: Number(els.opacity.value)
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
      const lectureText = status.lectureId ? `Lecture ${status.lectureId}` : "Current lecture";
      els.studyStatus.textContent = `Uses transcript from ${lectureText}.`;
    }

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
    }
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
        preferImportedSpanish: false
      });

      if (!transcriptResponse || !transcriptResponse.ok) {
        throw new Error((transcriptResponse && transcriptResponse.error) || "Could not collect transcript.");
      }

      const transcriptText = String(transcriptResponse.transcriptText || "").trim();
      if (transcriptText.length < 80) {
        throw new Error("Transcript is too short. Play the lecture a bit longer and try again.");
      }

      const level = String(els.studyLevel.value || "intermediate");
      const outputLanguage = String(els.studyLanguage.value || "es");
      const prompt = buildStudyPrompt(transcriptResponse, level, outputLanguage);

      setStudyBusy(true, "Generating explanation, examples and quiz...");
      const reply = await requestStudyReply(prompt);
      const parsed = parseStudyReply(reply);
      renderStudyOutput(parsed, transcriptResponse, reply, outputLanguage);

      const truncation = transcriptResponse.transcriptTruncated ? " (truncated transcript)" : "";
      showInfo(`Study guide generated from ${transcriptResponse.cueCount || 0} cues${truncation}.`);
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

  function buildStudyPrompt(transcriptPayload, level, outputLanguage) {
    const languageLabel = outputLanguage === "en" ? "English" : "Spanish";
    const levelLabelMap = {
      beginner: "very simple",
      intermediate: "clear and practical",
      advanced: "detailed and rigorous"
    };
    const levelLabel = levelLabelMap[level] || levelLabelMap.intermediate;
    const transcript = String(transcriptPayload.transcriptText || "").trim();

    return [
      "You are an expert study tutor.",
      `Write everything in ${languageLabel}.`,
      `Explain with a ${levelLabel} level for students.`,
      "Return only valid JSON with this exact shape:",
      "{\"simplified_explanation\":\"string\",\"key_points\":[\"string\"],\"examples\":[{\"concept\":\"string\",\"example\":\"string\",\"why_it_matters\":\"string\"}],\"mini_quiz\":[{\"question\":\"string\",\"options\":[\"A ...\",\"B ...\",\"C ...\",\"D ...\"],\"answer\":\"A\",\"explanation\":\"string\"}]}",
      "Rules:",
      "- key_points: 4 to 7 items",
      "- examples: 3 to 5 items",
      "- mini_quiz: exactly 5 questions with 4 options each",
      "- Keep wording concise, practical, and easy to memorize",
      "Lecture metadata:",
      `- source=${transcriptPayload.source || "unknown"}`,
      `- cue_count=${transcriptPayload.cueCount || 0}`,
      "Transcript:",
      transcript
    ].join("\n\n");
  }

  async function requestStudyReply(prompt) {
    const bootstrap = await postStudyApiJson("/sessions/bootstrap", {});
    const sessionId = bootstrap && bootstrap.session_id ? String(bootstrap.session_id) : "";
    if (!sessionId) {
      throw new Error("AI API did not return session_id.");
    }

    const encodedSessionId = encodeURIComponent(sessionId);
    // Some backend variants can auto-create a conversation on first message.
    // Try conversation/new, but do not fail hard if it is unavailable.
    try {
      await postStudyApiJson(`/sessions/${encodedSessionId}/conversation/new`, {});
    } catch (_error) {
      // Continue with message endpoint; we retry later if backend requests a new conversation.
    }

    let messageData = await postStudyApiJson(`/sessions/${encodedSessionId}/message`, {
      text: prompt,
      auto_recover: true
    });

    const hasPrimaryReply = messageData && (messageData.reply || messageData.text);
    if (!messageData || !messageData.ok || !hasPrimaryReply) {
      await postStudyApiJson(`/sessions/${encodedSessionId}/conversation/new`, {}).catch(() => {});
      messageData = await postStudyApiJson(`/sessions/${encodedSessionId}/message`, {
        text: prompt,
        auto_recover: true
      });
    }

    if (!messageData || !messageData.ok) {
      const errorText = messageData && messageData.error ? String(messageData.error) : "Unknown AI API error.";
      throw new Error(errorText);
    }

    const reply = String(messageData.reply || messageData.text || "").trim();
    if (!reply) {
      throw new Error("AI API returned an empty reply.");
    }
    return reply;
  }

  async function postStudyApiJson(path, body) {
    const bases = preferredStudyApiBase
      ? [preferredStudyApiBase].concat(STUDY_API_BASES.filter((base) => base !== preferredStudyApiBase))
      : STUDY_API_BASES.slice();

    let lastError = null;

    for (const base of bases) {
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body || {})
        });

        const bodyText = await response.text();
        const parsed = safeJsonParse(bodyText);
        if (!response.ok) {
          const detail = parsed && parsed.error
            ? String(parsed.error)
            : String(bodyText || "HTTP request failed").slice(0, 260);
          throw new Error(`HTTP ${response.status}: ${detail}`);
        }

        preferredStudyApiBase = base;
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
        return {};
      } catch (error) {
        lastError = new Error(`${base}${path}: ${toMessage(error)}`);
      }
    }

    throw lastError || new Error("Could not connect to local AI API.");
  }

  function parseStudyReply(replyText) {
    const direct = safeJsonParse(replyText);
    if (direct && typeof direct === "object") {
      return direct;
    }

    const fenced = String(replyText || "").match(/```json\s*([\s\S]*?)```/i)
      || String(replyText || "").match(/```\s*([\s\S]*?)```/i);
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

  function renderStudyOutput(parsed, transcriptPayload, rawReply, outputLanguage) {
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
      els.studyStatus.textContent = "Generated, but model did not return strict JSON.";
      return;
    }

    const explanation = firstString(parsed, [
      "simplified_explanation",
      "simple_explanation",
      "explanation"
    ]);
    const keyPoints = toStringArray(firstValue(parsed, ["key_points", "keyPoints", "main_points"]));
    const examples = normalizeExamples(firstValue(parsed, ["examples", "practice_examples", "real_examples"]));
    const quiz = normalizeQuiz(firstValue(parsed, ["mini_quiz", "quiz", "questions"]));

    lines.push("Simple explanation");
    lines.push(explanation || "No explanation returned.");
    lines.push("");

    lines.push("Key points");
    if (keyPoints.length) {
      for (let i = 0; i < keyPoints.length; i += 1) {
        lines.push(`${i + 1}. ${keyPoints[i]}`);
      }
    } else {
      lines.push("No key points returned.");
    }
    lines.push("");

    lines.push("Examples");
    if (examples.length) {
      for (let i = 0; i < examples.length; i += 1) {
        const item = examples[i];
        lines.push(`${i + 1}. ${item.concept || "Concept"}: ${item.example || "-"}`);
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

    els.studyOutput.textContent = lines.join("\n");
    els.studyStatus.textContent = "Study guide generated successfully.";
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
            why: ""
          };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const concept = String(item.concept || item.topic || item.title || "").trim();
        const example = String(item.example || item.content || item.text || "").trim();
        const why = String(item.why_it_matters || item.why || item.reason || "").trim();
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
        const explanation = String(item.explanation || item.reason || "").trim();

        if (!question && !options.length) {
          return null;
        }

        return {
          question,
          options,
          answer,
          explanation
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
      if (activeTabId == null) {
        reject(new Error("Active tab is not available."));
        return;
      }
      chrome.tabs.sendMessage(activeTabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Could not reach content script."));
          return;
        }
        resolve(response || { ok: false, error: "No response from content script." });
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
      savePasteDraftForCurrentLecture(String(els.pasteSrt.value || "")).catch(() => {});
    }, 260);
  }

  async function syncPasteDraftWithStatus() {
    const lectureKey = latestStatus && latestStatus.lectureKey ? String(latestStatus.lectureKey) : "";
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
    const lectureKey = latestStatus && latestStatus.lectureKey ? String(latestStatus.lectureKey) : "";
    if (!lectureKey) {
      return;
    }

    const map = await loadPasteDraftMap();
    if (String(text || "").trim()) {
      map[lectureKey] = String(text || "");
    } else {
      delete map[lectureKey];
    }

    await chrome.storage.local.set({ [POPUP_STORAGE_KEYS.esPasteDraftByLecture]: map });
  }

  async function loadPasteDraftMap() {
    const data = await chrome.storage.local.get(POPUP_STORAGE_KEYS.esPasteDraftByLecture);
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
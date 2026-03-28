(function () {
  "use strict";

  const POPUP_STORAGE_KEYS = {
    esPasteDraftByLecture: "usg_popup_es_paste_draft_by_lecture_v1"
  };

  const els = {
    courseSlug: document.getElementById("courseSlug"),
    lectureId: document.getElementById("lectureId"),
    hasEnglish: document.getElementById("hasEnglish"),
    hasSpanish: document.getElementById("hasSpanish"),
    importedCount: document.getElementById("importedCount"),
    prefetchMode: document.getElementById("prefetchMode"),
    prefetchedCount: document.getElementById("prefetchedCount"),
    autoDownloaded: document.getElementById("autoDownloaded"),
    statusReason: document.getElementById("statusReason"),
    refreshBtn: document.getElementById("refreshBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    clearBtn: document.getElementById("clearBtn"),
    fileInput: document.getElementById("fileInput"),
    pasteSrt: document.getElementById("pasteSrt"),
    pasteImportBtn: document.getElementById("pasteImportBtn"),
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
    els.statusReason.textContent = status.reason || "Ready.";

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
    els.exportBtn.disabled = disabled;
    els.importBtn.disabled = disabled;
    els.pasteImportBtn.disabled = disabled;
    els.pasteSrt.disabled = disabled;
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
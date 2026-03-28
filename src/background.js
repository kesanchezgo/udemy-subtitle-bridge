"use strict";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && message.type;
  if (type !== "USG_DOWNLOAD_EN_SRT_AUTO") {
    return false;
  }

  const fileName = sanitizeFileName(String((message && message.fileName) || "udemy_en.srt"));
  const srt = String((message && message.srt) || "");
  if (!srt.trim()) {
    sendResponse({ ok: false, error: "SRT content is empty." });
    return false;
  }

  const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(srt)}`;
  chrome.downloads.download(
    {
      url: dataUrl,
      filename: `UdemySubtitleBridge/${fileName}`,
      saveAs: false,
      conflictAction: "uniquify"
    },
    (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) {
        sendResponse({ ok: false, error: err.message || "Automatic download failed." });
        return;
      }
      sendResponse({ ok: true, downloadId: Number(downloadId) || 0 });
    }
  );

  return true;
});

function sanitizeFileName(fileName) {
  const base = fileName.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!base) {
    return "udemy_en.srt";
  }
  if (/\.srt$/i.test(base)) {
    return base;
  }
  return `${base}.srt`;
}

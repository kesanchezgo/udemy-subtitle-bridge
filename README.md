# Udemy Subtitle Bridge

Chrome extension (Manifest V3) to:

1. detect EN/ES caption state on Udemy lecture pages,
2. auto-capture EN subtitles on lecture load (when native ES is missing),
3. auto-download EN subtitles to SRT (one file per lecture, when ES native is missing),
4. export EN subtitles to SRT instantly from local cache,
5. import translated ES SRT,
6. render ES subtitles as a local overlay synced with the video,
7. paste translated ES SRT directly in popup (no file upload required),
8. disable Export/Import when native ES captions exist (as requested).

## Load Extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   `d:\Proyectos\OTROS\UDEMY-SUBTITLE`

## Usage Flow

1. Open a Udemy lecture page.
2. Open the extension popup.
3. Click **Refresh status**.
4. Wait a few seconds while **Auto EN cues** fills in.
5. The extension auto-downloads EN SRT in your Downloads folder when native ES is missing.
6. EN auto-download is deduplicated per lecture, so the same lecture is not downloaded repeatedly.
7. If needed, you can still click **Export EN as SRT** (same cached result).
8. Translate that file externally and click **Import ES SRT**.
9. Or paste the translated ES SRT into **Paste ES SRT** and click **Apply Pasted ES SRT**.
10. Imported ES overlay is auto-enabled and rendered over the video.
11. Optionally tune offset/font/opacity.

## Notes

- This extension keeps everything local in browser storage.
- Imported subtitles are stored per lecture key (`courseSlug::lectureId`).
- Auto-captured EN subtitles are also stored per lecture key and reused instantly on next open.
- Auto-downloaded EN files are saved by the extension under `Downloads/UdemySubtitleBridge/`.
- Automatic EN download is marked per lecture to avoid duplicate file downloads.
- Pasted ES SRT text is saved per lecture in extension storage for quick reuse.
- Native captions are hidden only while ES overlay is enabled.
- On lecture load, the extension checks native ES first; if ES exists, EN auto-capture is skipped by rule.
- Export uses auto-cached EN first, then falls back to transcript/textTrack/live capture only if needed.
- If textTracks are not yet loaded and no VTT URL appears yet, live EN playback for 20-40 seconds improves fallback capture.
- If transcript timing attributes are missing, transcript export uses click-to-time mapping.
- Network bridge injection is CSP-safe (external extension file, not inline script), so Udemy inline-script restrictions do not block it.
- Storyboard/thumbnail VTT files (e.g. thumb-sprites.jpg#xywh=...) are automatically rejected and never cached/exported as subtitles.
- After importing ES SRT, overlay is enabled automatically so translated subtitles appear immediately.

## Current Scope

- No upload to Udemy servers.
- No translation API integration.
- SRT only.
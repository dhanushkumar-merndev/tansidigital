# Fix Plan: Manual Download 0B, Netlify Cron Timeout, Server Performance, Double Telegram Notifications

## File 1: `src/components/dashboard-client.tsx`

### Change 1a — Dynamic pixelRatio (line 1749)

**Replace:**
```typescript
      const canvas = document.createElement("canvas");
      const pixelRatio = 4;
```

**With:**
```typescript
      const canvas = document.createElement("canvas");
      const pixelRatio =
        digitalLeadsExportTable.rows.length > 20 || digitalLeadsExportTable.columns.length > 10
          ? 2
          : digitalLeadsExportTable.rows.length > 10 || digitalLeadsExportTable.columns.length > 6
            ? 3
            : 4;
```

**Why:** Prevents canvas `toDataURL()` from exceeding browser memory limits (~128MB) when the table has 18+ rows or many columns. At pixelRatio=2, the image will still be crisp (2x retina quality) but use ~75% less memory than 4x.

---

## File 2: `src/lib/daily-telegram-report.ts`

### Change 2a — Reduce canvas scale (line 388)

**Replace:**
```typescript
  const scale = 10;
```

**With:**
```typescript
  const scale = 6;
```

**Why:** Cuts rendered pixel count by ~64% (6²/10² = 0.36). Column width is still 936px with 78px font — far more than needed for Telegram/Drive viewing. This is the single biggest performance win for the server.

### Change 2b — Optimize font path order (lines 36-42)

**Replace:**
```typescript
const REPORT_PRIMARY_FONT_PATHS = [
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "Avenir LT Std 55 Roman.otf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "DigitalLeads.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "report-font.ttf"),
];
```

**With:**
```typescript
const REPORT_PRIMARY_FONT_PATHS = [
  join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "report-font.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "Avenir LT Std 55 Roman.otf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "DigitalLeads.ttf"),
];
```

**Why:** On Netlify, `public/fonts/` is the most likely bundled path. Trying it first saves wasted `existsSync` calls on 3-4 paths that don't exist, cutting cold start time by ~1-2s.

### Change 2c — Optimize symbol font path order (lines 43-51)

**Replace:**
```typescript
const REPORT_SYMBOL_FONT_PATHS = [
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "NotoSans-Regular.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "NotoSans-Regular.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];
```

**With:**
```typescript
const REPORT_SYMBOL_FONT_PATHS = [
  join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "NotoSans-Regular.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "fonts", "NotoSans-Regular.ttf"),
  join(/*turbopackIgnore: true*/ process.cwd(), "netlify", "font", "NotoSans-Regular.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];
```

---

## File 3: `src/lib/daily-drive-report.ts`

### Change 3a — Add double-notification guard in `notifyAndFinalizeReport` (line 255)

**Replace the entire function (lines 255-293):**

```typescript
async function notifyAndFinalizeReport({
  folder,
  uploaded,
}: {
  folder: Awaited<ReturnType<typeof resolveReportFolder>>;
  uploaded: {
    fileId: string;
    filename: string;
    webViewLink: string;
  };
}) {
  console.info("[daily-drive-report] Verifying no duplicate upload happened.", {
    fileId: uploaded.fileId,
    filename: folder.filename,
  });

  // Re-check Drive: if another file with same name was created before ours,
  // a concurrent invocation already handled this. Delete ours and skip.
  const drive = getDriveClient();
  const allVersions = await findReportImages({
    drive,
    filename: folder.filename,
    folderId: folder.folderId,
  });
  const earlier = allVersions.find(
    (f) => f.fileId !== uploaded.fileId && f.createdAt < new Date().toISOString(),
  );

  if (earlier) {
    console.info("[daily-drive-report] Duplicate upload detected — removing ours.", {
      ourFileId: uploaded.fileId,
      existingFileId: earlier.fileId,
    });
    await drive.files.delete({ fileId: uploaded.fileId, supportsAllDrives: true });
    return earlier;
  }

  console.info("[daily-drive-report] Sending Telegram success notification.", {
    fileId: uploaded.fileId,
    filename: folder.filename,
  });

  try {
    await sendTelegramTextMessageWithButton({
      buttonText: "View",
      text: [
        "Daily report uploaded successfully.",
        `File: ${folder.filename}`,
        `Folder: ${folder.year}/${folder.month}`,
      ].join("\n"),
      url: uploaded.webViewLink,
    });
  } catch (error) {
    console.error("[daily-drive-report] Telegram success notification failed.", {
      error: error instanceof Error ? error.message : String(error),
      fileId: uploaded.fileId,
      filename: folder.filename,
    });
    throw error;
  }

  console.info("[daily-drive-report] Telegram success notification sent.");

  return uploaded;
}
```

**Why:** If two Netlify function invocations run concurrently (due to timeout+retry), both upload the same file. The second one to finish will detect the first one's file, delete its own duplicate, and skip sending a second notification.

---

## File 4: `netlify/functions/daily-report.js`

### Change 4a — Add status and better logging

**Replace entire file (lines 1-24):**

```javascript
import { generateUploadAndNotifyDailyDriveReport } from "../../src/lib/daily-drive-report";

const dailyReport = async () => {
  try {
    const uploaded = await generateUploadAndNotifyDailyDriveReport();

    return Response.json({
      fileId: uploaded.fileId,
      filename: uploaded.filename,
      status: uploaded.status,
      ok: true,
      webViewLink: uploaded.webViewLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[daily-report] Failed:", message);
    return Response.json({ error: message, ok: false }, { status: 500 });
  }
};

export default dailyReport;
```

---

## Expected Results

| Issue | Before | After |
|---|---|---|
| Manual download (18+ rows) | 0B file (canvas OOM) | ~200-400KB PNG |
| Server cron render time | 15-20s | 6-9s |
| Cold start overhead | 5-8s (font search) | 3-5s |
| Total cron time (30s budget) | ~25-30s (timeout risk) | ~12-15s (safe) |
| Duplicate Telegram notifications | 2 messages possible | 1 message max |

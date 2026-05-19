import { Readable } from "node:stream";

import { google } from "googleapis";

import { createCombinedDailyReportImage } from "./daily-telegram-report";
import {
  sendTelegramTextMessageWithButton,
  sendTelegramTextMessageWithCallbackButton,
} from "./telegram";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const IST_TIME_ZONE = "Asia/Kolkata";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}

function getGooglePrivateKey() {
  return getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function getDriveClient() {
  const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();

  if (oauthRefreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: oauthRefreshToken,
    });

    return google.drive({ auth: oauth2Client, version: "v3" });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getRequiredEnv("GOOGLE_CLIENT_EMAIL"),
      private_key: getGooglePrivateKey(),
    },
    scopes: [DRIVE_SCOPE],
  });

  return google.drive({ auth, version: "v3" });
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: IST_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const monthName = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: IST_TIME_ZONE,
  }).format(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const day = byType.get("day") ?? "01";
  const monthNumber = byType.get("month") ?? "01";
  const year = byType.get("year") ?? String(date.getUTCFullYear());

  return {
    day,
    dateKey: `${year}-${monthNumber}-${day}`,
    filename: `${day}-${monthNumber}-${year}.png`,
    month: monthName,
    year,
  };
}

export function parseDailyReportDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Invalid daily report retry date.");
  }

  const parsed = new Date(`${dateKey}T00:00:00+05:30`);

  if (Number.isNaN(parsed.getTime()) || getIstParts(parsed).dateKey !== dateKey) {
    throw new Error("Invalid daily report retry date.");
  }

  return parsed;
}

async function getOrCreateFolder({
  drive,
  name,
  parentId,
}: {
  drive: ReturnType<typeof getDriveClient>;
  name: string;
  parentId: string;
}) {
  const escapedName = escapeDriveQueryValue(name);
  const escapedParentId = escapeDriveQueryValue(parentId);
  const existing = await drive.files.list({
    fields: "files(id, name, webViewLink)",
    includeItemsFromAllDrives: true,
    q: [
      `name = '${escapedName}'`,
      `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
      `'${escapedParentId}' in parents`,
      "trashed = false",
    ].join(" and "),
    supportsAllDrives: true,
  });
  const folder = existing.data.files?.[0];

  if (folder?.id) {
    return folder.id;
  }

  const created = await drive.files.create({
    fields: "id",
    requestBody: {
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      name,
      parents: [parentId],
    },
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`Google Drive did not return an id for folder ${name}.`);
  }

  return created.data.id;
}

async function uploadReportImage({
  buffer,
  filename,
  folderId,
}: {
  buffer: Uint8Array;
  filename: string;
  folderId: string;
}) {
  const drive = getDriveClient();
  const existingFile = await findReportImage({
    drive,
    filename,
    folderId,
  });

  if (existingFile) {
    return {
      ...existingFile,
      status: "existing" as const,
    };
  }

  const upload = await drive.files.create({
    fields: "id, name, webViewLink",
    media: {
      body: Readable.from(Buffer.from(buffer)),
      mimeType: "image/png",
    },
    requestBody: {
      mimeType: "image/png",
      name: filename,
      parents: [folderId],
    },
    supportsAllDrives: true,
  });

  if (!upload.data.id || !upload.data.webViewLink) {
    throw new Error("Google Drive upload finished without a file link.");
  }

  return {
    fileId: upload.data.id,
    filename: upload.data.name ?? filename,
    status: "created" as const,
    webViewLink: upload.data.webViewLink,
  };
}

async function findReportImages({
  drive,
  filename,
  folderId,
}: {
  drive: ReturnType<typeof getDriveClient>;
  filename: string;
  folderId: string;
}) {
  const escapedFilename = escapeDriveQueryValue(filename);
  const escapedFolderId = escapeDriveQueryValue(folderId);
  const existing = await drive.files.list({
    fields: "files(id, name, webViewLink, createdTime)",
    includeItemsFromAllDrives: true,
    orderBy: "createdTime",
    q: [
      `name = '${escapedFilename}'`,
      `mimeType = 'image/png'`,
      `'${escapedFolderId}' in parents`,
      "trashed = false",
    ].join(" and "),
    supportsAllDrives: true,
  });

  return (existing.data.files ?? [])
    .filter((file) => file.id && file.webViewLink)
    .map((file) => ({
      createdTime: file.createdTime ?? "",
      fileId: file.id as string,
      filename: file.name ?? filename,
      webViewLink: file.webViewLink as string,
    }));
}

async function findReportImage(input: Parameters<typeof findReportImages>[0]) {
  return (await findReportImages(input))[0] ?? null;
}

async function resolveReportFolder(date = new Date()) {
  const drive = getDriveClient();
  const parentFolderId = getRequiredEnv("GOOGLE_DRIVE_FOLDER_ID");
  const { filename, month, year } = getIstParts(date);
  const yearFolderId = await getOrCreateFolder({
    drive,
    name: year,
    parentId: parentFolderId,
  });
  const monthFolderId = await getOrCreateFolder({
    drive,
    name: month,
    parentId: yearFolderId,
  });

  return {
    filename,
    folderId: monthFolderId,
    month,
    year,
  };
}

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
  console.info("[daily-drive-report] Checking for concurrent duplicates.", {
    fileId: uploaded.fileId,
    filename: folder.filename,
  });

  const drive = getDriveClient();

  // Retry file listing with backoff — Drive has eventual consistency
  let allVersions = await findReportImages({ drive, filename: folder.filename, folderId: folder.folderId });

  for (let attempt = 0; attempt < 3 && allVersions.length < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    allVersions = await findReportImages({ drive, filename: folder.filename, folderId: folder.folderId });
  }

  if (allVersions.length > 1) {
    const sorted = [...allVersions].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
    const oldest = sorted[0];

    if (oldest.fileId !== uploaded.fileId) {
      console.info("[daily-drive-report] Concurrent duplicate detected — removing ours.", {
        ourFileId: uploaded.fileId,
        keptFileId: oldest.fileId,
      });
      await drive.files.delete({ fileId: uploaded.fileId, supportsAllDrives: true });
      return oldest;
    }

    // We're the oldest — clean up newer duplicates from concurrent runs
    for (const dup of sorted.slice(1)) {
      try {
        await drive.files.delete({ fileId: dup.fileId, supportsAllDrives: true });
      } catch {
        // Race: another invocation may have already deleted it
      }
    }
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

export async function generateUploadAndNotifyDailyDriveReport(date = new Date(), notify = true) {
  console.info(`[daily-drive-report] Starting daily report upload for ${date.toISOString()}.`);

  try {
    const drive = getDriveClient();
    const folder = await resolveReportFolder(date);
    console.info("[daily-drive-report] Drive folder resolved.", {
      month: folder.month,
      year: folder.year,
    });

    const existingFile = await findReportImage({
      drive,
      filename: folder.filename,
      folderId: folder.folderId,
    });

    if (existingFile) {
      console.info("[daily-drive-report] Report already exists in Google Drive.", {
        fileId: existingFile.fileId,
        filename: existingFile.filename,
        telegramNotified: true,
      });
      return existingFile;
    }

    console.info("[daily-drive-report] Generating combined report image (this may take 20-40s)...");
    const buffer = await createCombinedDailyReportImage(date);
    console.info("[daily-drive-report] Combined report image generated successfully.", {
      bytes: buffer.byteLength,
      filename: folder.filename,
    });

    const uploaded = await uploadReportImage({
      buffer,
      filename: folder.filename,
      folderId: folder.folderId,
    });
    
    console.info("[daily-drive-report] Report uploaded to Google Drive.", {
      fileId: uploaded.fileId,
      filename: uploaded.filename,
      status: uploaded.status,
    });

    if (notify) {
      console.info("[daily-drive-report] Triggering Telegram notification step...");
      return await notifyAndFinalizeReport({
        folder,
        uploaded,
      });
    }

    console.info("[daily-drive-report] Report process completed (notification skipped).");

    return uploaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[daily-drive-report] Failed to generate or upload report.", {
      error: message,
    });

    if (notify) {
      try {
        await sendTelegramTextMessageWithCallbackButton({
          buttonText: "Retry",
          callbackData: `daily_report_retry:${getIstParts(date).dateKey}`,
          text: ["Daily report upload failed.", `Error: ${message}`].join("\n"),
        });
      } catch (telegramError) {
        console.error("[daily-drive-report] Failed to send Telegram failure notification.", {
          error: telegramError instanceof Error ? telegramError.message : String(telegramError),
        });
      }
    }

    throw error;
  }
}

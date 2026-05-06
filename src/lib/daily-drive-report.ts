import { Readable } from "node:stream";

import { google } from "googleapis";

import { createCombinedDailyReportImage } from "./daily-telegram-report";
import { sendTelegramTextMessage, sendTelegramTextMessageWithButton } from "./telegram";

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
    filename: `${day}-${monthNumber}-${year}.png`,
    month: monthName,
    year,
  };
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
  const escapedFilename = escapeDriveQueryValue(filename);
  const escapedFolderId = escapeDriveQueryValue(folderId);
  const existing = await drive.files.list({
    fields: "files(id, name, webViewLink)",
    includeItemsFromAllDrives: true,
    q: [
      `name = '${escapedFilename}'`,
      `mimeType = 'image/png'`,
      `'${escapedFolderId}' in parents`,
      "trashed = false",
    ].join(" and "),
    supportsAllDrives: true,
  });
  const existingFile = existing.data.files?.[0];

  if (existingFile?.id) {
    const updated = await drive.files.update({
      fileId: existingFile.id,
      fields: "id, name, webViewLink",
      media: {
        body: Readable.from(Buffer.from(buffer)),
        mimeType: "image/png",
      },
      requestBody: {
        mimeType: "image/png",
        name: filename,
      },
      supportsAllDrives: true,
    });

    if (!updated.data.id || !updated.data.webViewLink) {
      throw new Error("Google Drive update finished without a file link.");
    }

    return {
      fileId: updated.data.id,
      filename: updated.data.name ?? filename,
      webViewLink: updated.data.webViewLink,
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
    webViewLink: upload.data.webViewLink,
  };
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

export async function generateUploadAndNotifyDailyDriveReport(date = new Date(), notify = true) {
  console.info(`[daily-drive-report] Starting daily report upload for ${date.toISOString()}.`);

  try {
    const folder = await resolveReportFolder(date);
    console.info("[daily-drive-report] Drive folder resolved.", {
      month: folder.month,
      year: folder.year,
    });

    const buffer = await createCombinedDailyReportImage(date);
    console.info("[daily-drive-report] Combined report image generated.", {
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
    });

    if (notify) {
      await sendTelegramTextMessageWithButton({
        buttonText: "View",
        text: [
          "Daily report uploaded successfully.",
          `File: ${uploaded.filename}`,
          `Folder: ${folder.year}/${folder.month}`,
        ].join("\n"),
        url: uploaded.webViewLink,
      });
      console.info("[daily-drive-report] Telegram success notification sent.");
    }

    return uploaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[daily-drive-report] Failed to generate or upload report.", {
      error: message,
    });

    if (notify) {
      try {
        await sendTelegramTextMessage(
          ["Daily report upload failed.", `Error: ${message}`].join("\n"),
        );
      } catch (telegramError) {
        console.error("[daily-drive-report] Failed to send Telegram failure notification.", {
          error: telegramError instanceof Error ? telegramError.message : String(telegramError),
        });
      }
    }

    throw error;
  }
}

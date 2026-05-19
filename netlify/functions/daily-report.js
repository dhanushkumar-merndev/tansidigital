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

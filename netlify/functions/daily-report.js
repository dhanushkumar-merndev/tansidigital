import { generateUploadAndNotifyDailyDriveReport } from "../../src/lib/daily-drive-report";

const dailyReport = async () => {
  try {
    const uploaded = await generateUploadAndNotifyDailyDriveReport();

    return Response.json({
      fileId: uploaded.fileId,
      filename: uploaded.filename,
      ok: true,
      webViewLink: uploaded.webViewLink,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      },
      { status: 500 },
    );
  }
};

export default dailyReport;

import { sendDailyTelegramReports } from "../../src/lib/daily-telegram-report";

const sendDailyTelegramReport = async () => {
  try {
    await sendDailyTelegramReports();
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[daily-telegram-report] Failed to send report.", {
      error: error instanceof Error ? error.message : error,
    });

    return new Response("error", { status: 500 });
  }
};

export default sendDailyTelegramReport;

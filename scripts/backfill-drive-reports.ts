import { generateUploadAndNotifyDailyDriveReport } from "../src/lib/daily-drive-report";

async function backfill() {
  // Array of dates to backfill for May
  const dates = [
    new Date("2026-05-01T09:00:00+05:30"),
    new Date("2026-05-02T09:00:00+05:30"),
    new Date("2026-05-03T09:00:00+05:30"),
    new Date("2026-05-04T09:00:00+05:30"),
    new Date("2026-05-05T09:00:00+05:30"),
    new Date("2026-05-06T09:00:00+05:30"),
  ];

  console.log("Starting backfill for May 1-6...");

  for (const date of dates) {
    console.log(`Generating report for ${date.toDateString()}...`);
    try {
      await generateUploadAndNotifyDailyDriveReport(date, false);
      console.log(`✅ Success for ${date.toDateString()}`);
    } catch (error) {
      console.error(`❌ Failed for ${date.toDateString()}:`, error);
    }
  }

  console.log("Backfill complete!");
}

backfill().catch(console.error);

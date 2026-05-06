import { generateUploadAndNotifyDailyDriveReport } from "../src/lib/daily-drive-report.ts";
import dotenv from "dotenv";
dotenv.config();

async function backfill() {
  const istOffset = 5.5 * 60 * 60 * 1000;
  // May 1st to May 5th
  for (let d = 1; d <= 5; d++) {
    const date = new Date(Date.UTC(2026, 4, d)); // May is index 4
    const istDate = new Date(date.getTime() - istOffset);
    
    try {
      console.log(`Backfilling for May ${d}...`);
      await generateUploadAndNotifyDailyDriveReport(istDate, false);
      console.log(`Successfully backfilled May ${d}`);
    } catch (err) {
      console.error(`Failed to backfill May ${d}:`, err);
    }
  }
  console.log("Backfill process finished.");
}

backfill();

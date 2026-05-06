import { generateUploadAndNotifyDailyDriveReport } from "@/lib/daily-drive-report";

export async function GET() {
  const results = [];
  const istOffset = 5.5 * 60 * 60 * 1000;
  
  // May 1st to May 5th
  for (let d = 1; d <= 5; d++) {
    const date = new Date(Date.UTC(2026, 4, d)); // May is index 4
    // Adjust to roughly match IST midnight for the purpose of the report logic
    const istDate = new Date(date.getTime() - istOffset);
    
    try {
      console.log(`Backfilling for May ${d}...`);
      const uploaded = await generateUploadAndNotifyDailyDriveReport(istDate, false);
      results.push({ date: date.toISOString(), ok: true, fileId: uploaded.fileId });
    } catch (err) {
      results.push({ date: date.toISOString(), ok: false, error: String(err) });
    }
  }

  return Response.json({ results });
}

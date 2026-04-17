import { NextResponse } from "next/server";

import { verifyDigitalPin } from "@/lib/auth";
import { appendDigitalLeadImport, type DigitalLeadImportEntry } from "@/lib/sheets";

type ImportBody = {
  pin?: string;
  promptUsed?: string;
  payload?: {
    entries?: Array<{
      date?: unknown;
      actual?: unknown;
      contacted?: unknown;
      nonContacted?: unknown;
      interested?: unknown;
    }>;
  };
};

type ImportEntry = NonNullable<NonNullable<ImportBody["payload"]>["entries"]>[number];

function toEntry(entry: ImportEntry): DigitalLeadImportEntry {
  if (typeof entry.date !== "string") {
    throw new Error("Each entry needs a valid date.");
  }

  return {
    date: entry.date,
    actual: Number(entry.actual ?? 0),
    contacted: Number(entry.contacted ?? 0),
    nonContacted: Number(entry.nonContacted ?? 0),
    interested: Number(entry.interested ?? 0),
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ImportBody | null;
  const pin = body?.pin?.trim() ?? "";
  const promptUsed = body?.promptUsed?.trim() ?? "";
  const rawEntries = body?.payload?.entries ?? [];

  if (!verifyDigitalPin(pin)) {
    return NextResponse.json({ ok: false, error: "Wrong digital PIN." }, { status: 401 });
  }

  if (!promptUsed) {
    return NextResponse.json({ ok: false, error: "Prompt text is required." }, { status: 400 });
  }

  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    return NextResponse.json({ ok: false, error: "No entries found in the pasted JSON." }, { status: 400 });
  }

  try {
    const entries = rawEntries.map((entry) => toEntry(entry));
    await appendDigitalLeadImport(entries, promptUsed);

    return NextResponse.json({ ok: true, count: entries.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to append digital lead data right now.";

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

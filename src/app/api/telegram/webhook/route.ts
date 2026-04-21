import { NextResponse } from "next/server";

import {
  findRowByUserId,
  getApprovalState,
  updateAllowColumn,
} from "@/lib/google-sheets";
import { answerCallbackQuery, editApprovalMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramWebhookUpdate = {
  callback_query?: {
    data?: string;
    id: string;
    message?: {
      chat?: { id?: number | string };
      message_id?: number;
    };
  };
};

function parseCallbackData(value: string | undefined) {
  if (!value) return null;

  const [action, userId] = value.split(":");
  if (!userId) return null;

  if (action !== "approve" && action !== "reject") {
    return null;
  }

  return { action, userId };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TelegramWebhookUpdate | null;
  const callbackQuery = body?.callback_query;

  if (!callbackQuery) {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseCallbackData(callbackQuery.data);

  if (!parsed) {
    await answerCallbackQuery(callbackQuery.id, "Unsupported action.", true);
    return NextResponse.json({ ok: true });
  }

  const row = await findRowByUserId(parsed.userId);

  if (!row) {
    await answerCallbackQuery(callbackQuery.id, "User row not found.", true);
    return NextResponse.json({ ok: true });
  }

  const desiredAllow = parsed.action === "approve" ? "TRUE" : "FALSE";
  const desiredState = parsed.action === "approve" ? "approved" : "blocked";
  const currentState = getApprovalState(row.allow);

  if (currentState === "pending") {
    await updateAllowColumn(row.rowNumber, desiredAllow);
    row.allow = desiredAllow;
  }

  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  await answerCallbackQuery(
    callbackQuery.id,
    currentState === "pending"
      ? desiredState === "approved"
        ? "Access approved."
        : "Access rejected."
      : currentState === "approved"
        ? "Already approved."
        : "Already rejected.",
  );

  if (typeof chatId !== "undefined" && typeof messageId === "number") {
    await editApprovalMessage({
      chatId,
      createdTime: row.createdTime,
      messageId,
      name: row.name,
      status: getApprovalState(row.allow) === "approved" ? "approved" : "rejected",
      userId: row.id,
    });
  }

  return NextResponse.json({ ok: true });
}

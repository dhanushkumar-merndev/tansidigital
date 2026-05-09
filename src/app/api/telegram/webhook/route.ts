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

function parseDailyReportRetryCallbackData(value: string | undefined) {
  if (!value) return null;

  const [action, dateKey] = value.split(":");

  if (action !== "daily_report_retry" || !dateKey) {
    return null;
  }

  return { dateKey };
}

function isExpiredTelegramCallbackError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("query is too old") ||
    message.includes("query id is invalid") ||
    message.includes("response timeout expired")
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TelegramWebhookUpdate | null;
  const callbackQuery = body?.callback_query;

  try {
    if (!callbackQuery) {
      console.info("[telegram-webhook] Ignored update without callback_query.");
      return NextResponse.json({ ok: true });
    }

    const dailyReportRetry = parseDailyReportRetryCallbackData(callbackQuery.data);

    if (dailyReportRetry) {
      console.info("[telegram-webhook] Received daily report retry callback.", {
        callbackId: callbackQuery.id,
        dateKey: dailyReportRetry.dateKey,
      });

      try {
        await answerCallbackQuery(callbackQuery.id, "Retry started.");
      } catch (error) {
        if (!isExpiredTelegramCallbackError(error)) {
          throw error;
        }

        console.warn("[telegram-webhook] Daily report retry callback answer expired.", {
          callbackId: callbackQuery.id,
          error: error instanceof Error ? error.message : error,
        });
      }

      try {
        const { generateUploadAndNotifyDailyDriveReport, parseDailyReportDateKey } = await import(
          "@/lib/daily-drive-report"
        );
        const retryDate = parseDailyReportDateKey(dailyReportRetry.dateKey);
        const uploaded = await generateUploadAndNotifyDailyDriveReport(retryDate);

        console.info("[telegram-webhook] Daily report retry finished.", {
          dateKey: dailyReportRetry.dateKey,
          fileId: uploaded.fileId,
          filename: uploaded.filename,
        });
      } catch (error) {
        console.error("[telegram-webhook] Daily report retry failed.", {
          callbackId: callbackQuery.id,
          dateKey: dailyReportRetry.dateKey,
          error: error instanceof Error ? error.message : error,
        });
      }

      return NextResponse.json({ ok: true });
    }

    const parsed = parseCallbackData(callbackQuery.data);
    console.info("[telegram-webhook] Received callback.", {
      callbackData: callbackQuery.data ?? null,
      callbackId: callbackQuery.id,
      parsedAction: parsed?.action ?? null,
      parsedUserId: parsed?.userId ?? null,
    });

    if (!parsed) {
      await answerCallbackQuery(callbackQuery.id, "Unsupported action.", true);
      return NextResponse.json({ ok: true });
    }

    const row = await findRowByUserId(parsed.userId);
    console.info("[telegram-webhook] Lookup result.", {
      foundRow: Boolean(row),
      rowAllow: row?.allow ?? null,
      rowId: row?.id ?? null,
      rowNumber: row?.rowNumber ?? null,
      userId: parsed.userId,
    });

    if (!row) {
      await answerCallbackQuery(callbackQuery.id, "User row not found.", true);
      return NextResponse.json({ ok: true });
    }

    const desiredAllow = parsed.action === "approve" ? "TRUE" : "FALSE";
    const desiredState = parsed.action === "approve" ? "approved" : "blocked";
    const currentState = getApprovalState(row.allow);

    const callbackMessage =
      currentState === "pending"
        ? desiredState === "approved"
          ? "Access approved."
          : "Access rejected."
        : desiredState === currentState
          ? `Already ${currentState === "approved" ? "approved" : "rejected"}.`
          : desiredState === "approved"
            ? "Access re-granted."
            : "Access revoked.";

    try {
      await answerCallbackQuery(callbackQuery.id, callbackMessage);
    } catch (error) {
      if (!isExpiredTelegramCallbackError(error)) {
        throw error;
      }

      console.warn("[telegram-webhook] Callback answer expired.", {
        callbackId: callbackQuery.id,
        error: error instanceof Error ? error.message : error,
      });
    }

    if (currentState !== desiredState) {
      await updateAllowColumn(row.rowNumber, desiredAllow);
      row.allow = desiredAllow;
      console.info("[telegram-webhook] Updated sheet row.", {
        currentState,
        desiredState,
        rowNumber: row.rowNumber,
        userId: row.id,
      });
    } else {
      console.info("[telegram-webhook] No change required.", {
        currentState,
        rowNumber: row.rowNumber,
        userId: row.id,
      });
    }

    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;

    if (typeof chatId !== "undefined" && typeof messageId === "number") {
      try {
        await editApprovalMessage({
          chatId,
          createdTime: row.createdTime,
          messageId,
          name: row.name,
          status: getApprovalState(row.allow) === "approved" ? "approved" : "rejected",
          userId: row.id,
        });
      } catch (error) {
        console.warn("[telegram-webhook] Unable to edit Telegram message.", {
          callbackId: callbackQuery.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook] Failed to process callback.", {
      callbackData: callbackQuery?.data ?? null,
      callbackId: callbackQuery?.id ?? null,
      error: error instanceof Error ? error.message : error,
    });

    if (callbackQuery?.id) {
      await answerCallbackQuery(
        callbackQuery.id,
        "Approval failed on server. Check deployment logs.",
        true,
      ).catch(() => null);
    }

    return NextResponse.json({ ok: true });
  }
}

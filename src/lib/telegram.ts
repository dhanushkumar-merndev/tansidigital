type ApprovalMessageInput = {
  createdTime: string;
  name: string;
  userId: string;
};

type EditApprovalMessageInput = ApprovalMessageInput & {
  chatId: number | string;
  messageId: number;
  status: "approved" | "rejected";
};

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  return token;
}

function getTelegramChatId() {
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID.");
  }

  return chatId;
}

async function telegramRequest<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${getTelegramBotToken()}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { description?: string; ok?: boolean; result?: T }
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed.`);
  }

  return data.result as T;
}

function buildApprovalMessageText({
  createdTime,
  name,
  userId,
}: ApprovalMessageInput) {
  return [
    "New login approval request",
    `Name: ${name || "Unknown"}`,
    `User ID: ${userId}`,
    `Created Time: ${createdTime || "Unknown"}`,
  ].join("\n");
}

function buildResolvedMessageText({
  createdTime,
  name,
  status,
  userId,
}: EditApprovalMessageInput) {
  const statusLabel = status === "approved" ? "Approved" : "Rejected";

  return [
    "Login approval request resolved",
    `Status: ${statusLabel}`,
    `Name: ${name || "Unknown"}`,
    `User ID: ${userId}`,
    `Created Time: ${createdTime || "Unknown"}`,
  ].join("\n");
}

export async function sendApprovalMessage(input: ApprovalMessageInput) {
  return telegramRequest<{ chat: { id: number | string }; message_id: number }>(
    "sendMessage",
    {
      chat_id: getTelegramChatId(),
      text: buildApprovalMessageText(input),
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Approve",
              callback_data: `approve:${input.userId}`,
            },
            {
              text: "❌ Reject",
              callback_data: `reject:${input.userId}`,
            },
          ],
        ],
      },
    },
  );
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
) {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    show_alert: showAlert,
    text,
  });
}

export async function editApprovalMessage(input: EditApprovalMessageInput) {
  try {
    await telegramRequest("editMessageText", {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: buildResolvedMessageText(input),
      reply_markup: {
        inline_keyboard: [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.toLowerCase().includes("message is not modified")) {
      return;
    }

    throw error;
  }
}

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

type TelegramPhotoInput = {
  buffer: Uint8Array;
  caption?: string;
  chatId?: number | string;
  filename: string;
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

export function getTelegramDefaultChatId() {
  return getTelegramChatId();
}

function toBlobSafeBytes(buffer: Uint8Array) {
  const copied = new Uint8Array(buffer.byteLength);
  copied.set(buffer);
  return copied;
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

export async function sendTelegramTextMessage(
  text: string,
  chatId = getTelegramChatId(),
) {
  return telegramRequest<{ chat: { id: number | string }; message_id: number }>(
    "sendMessage",
    {
      chat_id: chatId,
      text,
    },
  );
}

export async function sendTelegramPhoto({
  buffer,
  caption,
  chatId = getTelegramChatId(),
  filename,
}: TelegramPhotoInput) {
  const binary = toBlobSafeBytes(buffer);
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  if (caption) {
    formData.append("caption", caption);
  }
  formData.append(
    "photo",
    new Blob([binary], { type: filename?.endsWith(".png") ? "image/png" : "image/jpeg" }),
    filename ?? "photo.jpg",
  );

  const response = await fetch(
    `https://api.telegram.org/bot${getTelegramBotToken()}/sendPhoto`,
    {
      method: "POST",
      body: formData,
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { description?: string; ok?: boolean }
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Telegram sendPhoto failed.");
  }
}

export async function sendTelegramDocument({
  buffer,
  caption,
  chatId = getTelegramChatId(),
  filename,
}: TelegramPhotoInput) {
  const binary = toBlobSafeBytes(buffer);
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  if (caption) {
    formData.append("caption", caption);
  }
  formData.append(
    "document",
    new Blob([binary], { type: filename?.endsWith(".png") ? "image/png" : "image/jpeg" }),
    filename,
  );

  const response = await fetch(
    `https://api.telegram.org/bot${getTelegramBotToken()}/sendDocument`,
    {
      method: "POST",
      body: formData,
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { description?: string; ok?: boolean }
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Telegram sendDocument failed.");
  }
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
        inline_keyboard: [
          [
            input.status === "approved"
              ? {
                  text: "🔴 Invoke",
                  callback_data: `reject:${input.userId}`,
                }
              : {
                  text: "🟢 UnInvoke",
                  callback_data: `approve:${input.userId}`,
                },
          ],
        ],
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

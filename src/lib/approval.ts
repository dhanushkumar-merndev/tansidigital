import { findRowByUserId, getApprovalState, updateSentStatus } from "@/lib/google-sheets";
import { sendApprovalMessage } from "@/lib/telegram";

export type LoginApprovalResult = {
  approved: boolean;
  row: Awaited<ReturnType<typeof findRowByUserId>>;
  state: "approved" | "blocked" | "pending";
};

export async function handleLoginApproval(
  userId: string,
): Promise<LoginApprovalResult> {
  const row = await findRowByUserId(userId);

  if (!row) {
    throw new Error(`Unable to find approval row for user id "${userId}".`);
  }

  const state = getApprovalState(row.allow);

  if (state === "approved") {
    return {
      approved: true,
      row,
      state,
    };
  }

  if (state === "pending" && row.sentStatus.toUpperCase() !== "SENT") {
    await sendApprovalMessage({
      createdTime: row.createdTime,
      name: row.name,
      userId: row.id,
    });
    await updateSentStatus(row.rowNumber, "SENT");
    row.sentStatus = "SENT";
  }

  return {
    approved: false,
    row,
    state,
  };
}

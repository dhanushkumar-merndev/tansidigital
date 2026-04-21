import { AccessBlocked } from "@/components/access-blocked";
import { getAuthAccessStatus, getBrowserAccessStatus } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const authStatus = await getAuthAccessStatus({ forceAccessRefresh: true });
  const browserAccessStatus = await getBrowserAccessStatus({
    forceAccessRefresh: true,
  });

  if (
    authStatus.isAuthenticated &&
    !authStatus.isAccessBlocked &&
    !authStatus.isAccessPending
  ) {
    redirect("/");
  }

  if (
    !authStatus.isAuthenticated &&
    browserAccessStatus.accessState === "allowed"
  ) {
    redirect("/");
  }

  if (authStatus.isAccessBlocked || browserAccessStatus.isAccessBlocked) {
    redirect("/access-blocked");
  }

  return <AccessBlocked state="pending" />;
}

import { AccessBlocked } from "@/components/access-blocked";
import { getAuthAccessStatus, getBrowserAccessStatus } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type AccessBlockedPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AccessBlockedPage({
  searchParams,
}: AccessBlockedPageProps) {
  const params = await searchParams;
  const hasLegacyStateParam = typeof params.state !== "undefined";
  const authStatus = await getAuthAccessStatus({ forceAccessRefresh: true });
  const browserAccessStatus = await getBrowserAccessStatus({
    forceAccessRefresh: true,
  });

  if (hasLegacyStateParam) {
    redirect("/access-blocked");
  }

  if (
    authStatus.isAuthenticated &&
    !authStatus.isAccessBlocked &&
    !authStatus.isAccessPending
  ) {
    redirect("/");
  }

  if (authStatus.isAuthenticated) {
    return (
      <AccessBlocked
        state={authStatus.isAccessPending ? "pending" : "blocked"}
      />
    );
  }

  if (!authStatus.isAuthenticated && browserAccessStatus.accessState === "allowed") {
    redirect("/");
  }

  if (!authStatus.isAuthenticated && browserAccessStatus.accessState) {
    return (
      <AccessBlocked
        state={browserAccessStatus.isAccessPending ? "pending" : "blocked"}
      />
    );
  }

  return <AccessBlocked state="blocked" />;
}

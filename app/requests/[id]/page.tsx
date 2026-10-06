import { AppChat } from "@/components/app-chat";
import { Footer } from "@/components/footer";
import { RATE_LIMIT_PER_HOUR } from "@/lib/rate-limit";
import { REQUEST_IDS } from "@/lib/sandbox/requests";
import { siteHeaderProps } from "@/lib/site-header";

// One page per request, built at build time; any other id is a 404 (P2's spec §1, W-P17).
export const dynamicParams = false;

export function generateStaticParams() {
  return REQUEST_IDS.map((id) => ({ id }));
}

/**
 * A request's page (P2's spec §1, item 2): for now the agent panel alone, a full-page chat outside
 * the app shell, as P1's /try is; the request pane on its left comes in a later build step. The
 * chat e2e opens it at CHAT_PATH (spec §4.7). A server component: the header's values and
 * lib/rate-limit.ts are server-only, so they reach the client chat as props.
 */
export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  return (
    <div className="flex h-dvh flex-col">
      <AppChat {...siteHeaderProps()} rateLimitPerHour={RATE_LIMIT_PER_HOUR} requestId={id} />
      <Footer />
    </div>
  );
}

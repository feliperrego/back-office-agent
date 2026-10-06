import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { BoardLink } from "@/components/request/board-link";
import { RequestWorkspace } from "@/components/request/request-workspace";
import { SiteHeader } from "@/components/site-header";
import { SUPPORT_ASSISTANT_URL } from "@/lib/board/board";
import { format } from "@/lib/i18n/format";
import { messages } from "@/lib/i18n/messages";
import { RATE_LIMIT_PER_HOUR } from "@/lib/rate-limit";
import { REQUEST_IDS, requestById } from "@/lib/sandbox/requests";
import { storeData } from "@/lib/store/customers";
import { siteHeaderProps } from "@/lib/site-header";

// One page per request, built at build time; any other id is a 404 (P2's spec §1, W-P17).
export const dynamicParams = false;

export function generateStaticParams() {
  return REQUEST_IDS.map((id) => ({ id }));
}

// The served title is English, as the page is; the workspace sets it in the visitor's language.
export async function generateMetadata({ params }: PageProps<"/requests/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: format(messages.en.request.title, { id }) };
}

/**
 * A request's page (P2's spec §1 item 2), outside the app shell, as P1's /try is: the site header
 * with the way back to the Board, then the request pane and the agent panel, then the footer. The
 * chat e2e opens /requests/r01 as CHAT_PATH (spec §4.7). A server component: the header's values
 * and lib/rate-limit.ts are server-only, so they reach the client panel as props, with the
 * request's record and its customer's name; never the store's `about` text. The page is one
 * screen tall, the workspace filling what the header and the footer leave; on a screen shorter
 * than 32rem, a phone in landscape, that leaves the conversation a strip, so the page scrolls
 * instead and the workspace keeps a screen's height of its own (RequestWorkspace; the review's
 * m07).
 */
export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const record = requestById(id);
  const customer = storeData.customers.find(({ id }) => id === record.customerId);
  if (customer === undefined) throw new Error(`Unknown customer: ${record.customerId}`);
  const header = siteHeaderProps();
  return (
    <div className="flex h-dvh flex-col [@media(max-height:32rem)]:h-auto [@media(max-height:32rem)]:min-h-dvh">
      <SiteHeader {...header} actions={<BoardLink />} />
      <RequestWorkspace
        {...header}
        rateLimitPerHour={RATE_LIMIT_PER_HOUR}
        request={{
          id: record.id,
          customer: customer.name,
          reason: record.reason,
          source:
            record.source === null
              ? null
              : { ticket: record.source, href: `${SUPPORT_ASSISTANT_URL}/inbox/${record.source}` },
          message: record.message,
          note: record.note,
        }}
      />
      <Footer />
    </div>
  );
}

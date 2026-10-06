import { AppChat } from "@/components/app-chat";
import { Footer } from "@/components/footer";
import { RATE_LIMIT_PER_HOUR } from "@/lib/rate-limit";
import { siteHeaderProps } from "@/lib/site-header";

/**
 * The chat page (X-01 design §4.5). Project-owned. A server component: the header's values
 * (lib/site-header.ts) and lib/rate-limit.ts are server-only, so they reach the client chat as
 * props. The locale is resolved on the client (LocaleProvider, in the layout), so the page still
 * prerenders in English. It sits outside the app shell of app/(shell)/, as a full page (template
 * spec §5.12).
 */
export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <AppChat {...siteHeaderProps()} rateLimitPerHour={RATE_LIMIT_PER_HOUR} />
      <Footer />
    </div>
  );
}

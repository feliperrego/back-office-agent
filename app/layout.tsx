import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PAGE_TITLE_TEMPLATE } from "@/components/app-shell/page-title";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/project";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Each project sets its title and description in lib/project.ts (X-01 design §4.2). A page that
// names itself gets "<its name> · <product>" (template spec §5.12); one that does not, such as the
// chat, keeps the product's name.
export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: PAGE_TITLE_TEMPLATE },
  description: PRODUCT_DESCRIPTION,
};

// Pages are served in English; LocaleProvider switches the language, and <html lang>, on the
// client (X-01 design §4.2).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}

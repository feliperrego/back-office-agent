"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/components/i18n/locale-provider";

/**
 * The way back to the Board, in a request page's header (P2's spec §1 item 2): icon only below
 * sm, so the header fits at 375 px, with its name kept for assistive technology; a 44 px target
 * on a touch screen.
 */
export function BoardLink() {
  const { t } = useLocale();
  return (
    <Link
      href="/"
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium hover:bg-muted pointer-coarse:h-11 max-sm:aspect-square max-sm:px-0"
    >
      <ArrowLeft className="size-4 shrink-0" />
      <span className="max-sm:sr-only">{t.request.board}</span>
    </Link>
  );
}

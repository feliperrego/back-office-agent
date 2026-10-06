"use client";

import type { UIMessage } from "ai";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppChat } from "@/components/app-chat";
import { usePageTitle } from "@/components/app-shell/use-page-title";
import { format } from "@/lib/i18n/format";
import { fold } from "@/lib/sandbox/fold";
import { openSandbox, type Sandbox } from "@/lib/sandbox/sandbox";
import { RequestPane, type RequestView } from "./request-pane";

/**
 * The sandbox this conversation leaves: the seed plus the writes it ran (spec §4.2, lib/sandbox
 * fold), as the route and the eval fold it. A history the fold cannot read leaves the seed.
 */
function foldedSandbox(requestId: string, messages: UIMessage[]): Sandbox {
  try {
    return fold(openSandbox(requestId), messages).sandbox;
  } catch {
    return openSandbox(requestId);
  }
}

/**
 * A request's page below its header (P2's spec §1 item 2): the request pane and the agent panel,
 * side by side from md up, stacked on a phone. The page folds the conversation once each time it
 * changes, into the sandbox the pane shows and the cards preview, so an approved change shows on
 * the order at once. On a phone the pane opens on the person's toggle, and closes again at the
 * first send of each conversation, so the conversation has the room.
 */
export function RequestWorkspace({
  modelLabel,
  isMock,
  commit,
  rateLimitPerHour,
  request,
}: {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  rateLimitPerHour: number;
  request: RequestView;
}) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [open, setOpen] = useState(false);
  // Whether this conversation has sent; New chat empties it, and the next first send closes the
  // pane again.
  const sent = useRef(false);
  const sandbox = useMemo(() => foldedSandbox(request.id, messages), [request.id, messages]);
  usePageTitle((t) => format(t.request.title, { id: request.id }));

  const onMessagesChange = useCallback((next: UIMessage[]) => {
    setMessages(next);
    if (next.length === 0) sent.current = false;
    else if (!sent.current) {
      sent.current = true;
      setOpen(false);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <RequestPane
        request={request}
        sandbox={sandbox}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppChat
          modelLabel={modelLabel}
          isMock={isMock}
          commit={commit}
          rateLimitPerHour={rateLimitPerHour}
          requestId={request.id}
          sandbox={sandbox}
          onMessagesChange={onMessagesChange}
        />
      </div>
    </div>
  );
}

import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import type { AssistantRenderer } from "@/components/chat/message-list";
import { ToolCallList } from "@/components/trace/tool-call";
import { messageText } from "@/lib/trace/message-text";
import { toolViewsOf } from "@/lib/trace/tool-view";

type PlainTextMessageProps = {
  message: UIMessage;
  /** The answer is still streaming; once it is not, a call still running shows as not finished. */
  streaming: boolean;
  /** The caption row under the answer (Stopped, Cut, Regenerate), or null. */
  caption: ReactNode;
};

/**
 * The default assistant renderer (X-01 design §4.3): the answer's text as plain text, each step's
 * a blank line apart (messageText), with no Markdown, which the default instructions ask the model
 * not to write, then a chip for each tool call (template spec §5.10). It keeps the renderer contract: data-message-role="assistant"
 * on the root, the answer text as its first child div, even while it is still empty, and the
 * caption last. Chat's default hasContent, hasTextOrTools, counts what it shows.
 */
export function PlainTextMessage({ message, streaming, caption }: PlainTextMessageProps) {
  const tools = toolViewsOf(message);
  return (
    <div data-message-role="assistant" className="flex flex-col gap-2">
      <div className="whitespace-pre-wrap wrap-anywhere">{messageText(message)}</div>
      {tools.length > 0 && <ToolCallList views={tools} streaming={streaming} />}
      {caption}
    </div>
  );
}

/** Chat's default `renderAssistant`. */
export const renderPlainText: AssistantRenderer<UIMessage> = (message, { streaming, caption }) => (
  <PlainTextMessage message={message} streaming={streaming} caption={caption} />
);

import { ArrowUp, Square } from "lucide-react";
import { useId, useRef, useState, type Ref, type RefObject } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_USER_CHARS } from "@/lib/chat/config";
import { isComposingKey, isSendDoubleClick, shouldSubmitOnKey } from "@/lib/chat/ui";

type ComposerProps = {
  inputRef: Ref<HTMLTextAreaElement>;
  /** A request is in flight (submitted or streaming): the button is Stop. */
  busy: boolean;
  /**
   * Why the composer takes no text now, shown above it, or null when it takes text: the message
   * cap's notice, or the project's line while a card waits for the person's answer (P2's spec
   * §4.5).
   */
  readOnlyNotice: string | null;
  /** True while an IME composition is open on the page; Chat tracks it. */
  composing: RefObject<boolean>;
  /** Returns true when the text was sent, so the composer clears it. */
  onSend: (text: string) => boolean;
  onStop: () => void;
};

/**
 * Textarea plus one button that swaps Send and Stop (X-01 design §4.3). At the message cap, and
 * while a card waits for the person's answer (P2's spec §4.5), the textarea is read-only and
 * marked disabled, so it keeps the focus and any draft, and a line above it, tied to it by
 * aria-describedby, says why: start a new chat, or answer the card (template spec §5.8).
 */
export function Composer({
  inputRef,
  busy,
  readOnlyNotice,
  composing,
  onSend,
  onStop,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const { t } = useLocale();
  const noticeId = useId();
  const readOnly = readOnlyNotice !== null;
  // When this composer last sent, for the Stop button's double-click guard.
  const sentAt = useRef<number | null>(null);

  const submit = () => {
    if (!onSend(value)) return;
    sentAt.current = performance.now();
    setValue("");
  };

  return (
    <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {readOnly && (
        <p id={noticeId} className="mx-auto mb-2 w-full max-w-2xl text-sm text-muted-foreground">
          {readOnlyNotice}
        </p>
      )}
      <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
        <Textarea
          ref={inputRef}
          aria-label={t.composer.label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            const submitKey = shouldSubmitOnKey({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: isComposingKey(event.nativeEvent, composing.current),
            });
            if (!submitKey) return;
            // Enter never inserts a newline; it sends only when the chat can take a request.
            event.preventDefault();
            submit();
          }}
          maxLength={MAX_USER_CHARS}
          rows={1}
          // Not `disabled`: a disabled control drops the focus and leaves the Tab order. Read-only
          // keeps both, and aria-disabled tells assistive technology it takes no text.
          readOnly={readOnly}
          aria-disabled={readOnly || undefined}
          aria-describedby={readOnly ? noticeId : undefined}
          placeholder={readOnly ? undefined : t.composer.placeholder}
          className="max-h-40 min-h-11 min-w-0 resize-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        />
        {busy ? (
          <Button
            size="icon-lg"
            className="pointer-coarse:size-11"
            aria-label={t.composer.stop}
            onClick={(event) => {
              // The second click of a double-click on Send lands here once the button has
              // swapped; it must not stop the request the first click started. A later click,
              // even one the browser counts in the same chain, stops.
              const msSinceSend =
                sentAt.current === null ? null : performance.now() - sentAt.current;
              if (isSendDoubleClick({ detail: event.detail, msSinceSend })) return;
              onStop();
            }}
          >
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            size="icon-lg"
            className="pointer-coarse:size-11"
            aria-label={t.composer.send}
            disabled={value.trim() === "" || readOnly}
            onClick={submit}
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
}

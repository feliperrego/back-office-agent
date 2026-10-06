import { useId } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n/format";

/** A set of suggested prompts; with a heading it is a labelled section. */
export type PromptGroup = { heading?: string; prompts: readonly string[] };

/** The project's text for a new chat, in the current locale (X-01 design §4.3). */
export type EmptyStateContent = {
  title: string;
  intro?: string;
  groups: readonly PromptGroup[];
};

type EmptyStateProps = EmptyStateContent & {
  /** RATE_LIMIT_PER_HOUR from lib/rate-limit.ts, so the UI never states a wrong limit. */
  rateLimitPerHour: number;
  /** Sends the prompt immediately. */
  onPrompt: (text: string) => void;
};

/** One column below sm, two from sm up. A button sends the text it shows. */
function PromptButtons({
  prompts,
  onPrompt,
}: {
  prompts: readonly string[];
  onPrompt: (text: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <Button
          key={prompt}
          variant="outline"
          className="h-auto min-h-11 justify-start px-3 py-2 text-left whitespace-normal"
          onClick={() => onPrompt(prompt)}
        >
          {prompt}
        </Button>
      ))}
    </div>
  );
}

/** A group with a heading: a section named by its <h3>. */
function HeadedGroup({
  heading,
  prompts,
  onPrompt,
}: {
  heading: string;
  prompts: readonly string[];
  onPrompt: (text: string) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-medium">
        {heading}
      </h3>
      <PromptButtons prompts={prompts} onPrompt={onPrompt} />
    </section>
  );
}

/**
 * What a new chat shows (X-01 design §4.3): the title, the optional intro, each prompt group, and
 * the note on the hourly limit. The project's text arrives through props; only the note is shell
 * text.
 */
export function EmptyState({ title, intro, groups, rateLimitPerHour, onPrompt }: EmptyStateProps) {
  const { t } = useLocale();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-4 py-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {intro !== undefined && <p className="text-muted-foreground">{intro}</p>}
      </div>
      {groups.map((group, index) =>
        group.heading === undefined ? (
          <PromptButtons key={index} prompts={group.prompts} onPrompt={onPrompt} />
        ) : (
          <HeadedGroup
            key={index}
            heading={group.heading}
            prompts={group.prompts}
            onPrompt={onPrompt}
          />
        ),
      )}
      <p className="text-sm text-muted-foreground">
        {format(t.chat.rateNote, { n: rateLimitPerHour })}
      </p>
    </div>
  );
}

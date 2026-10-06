import { IS_MOCK, MODEL_LABEL } from "@/lib/ai/model";

/**
 * The site header's server-only values (template spec §5.6, §5.12): the model's label, mock mode
 * and the deployed commit, which the header carries as data-model, data-mock and data-commit.
 * Every page that renders the header passes them down as props, from here. Shell-owned.
 * Server-only: lib/ai/model.ts reads the server's environment.
 */
export type SiteHeaderValues = {
  modelLabel: string;
  isMock: boolean;
  /** The build's commit on Vercel, else "local": what a measurement records (template spec §7.5). */
  commit: string;
};

export function siteHeaderProps(): SiteHeaderValues {
  return {
    modelLabel: MODEL_LABEL,
    isMock: IS_MOCK,
    // || rather than ??: a variable set but empty counts as unset, so data-commit is never "".
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
  };
}

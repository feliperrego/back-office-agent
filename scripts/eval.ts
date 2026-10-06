/**
 * `pnpm eval` (template spec §5.11, §7.5): asks the frozen cases of measurements/cases.json once
 * each on the server, scores them by the project's script (lib/eval/project.ts), writes every
 * answer and score, and prints README line 1 and the first line of "How it's measured".
 * Shell-owned: lib/eval/command.ts holds what it does, and tests it.
 *
 * Mock mode, zero cost: AI_MOCK=1 pnpm eval
 *   It rewrites measurements/eval-mock.json, which the screens show until a real run exists.
 *   Its README lines only show the format: never paste them into the README.
 * Mock check, zero cost, what CI runs: AI_MOCK=1 pnpm eval --check
 *   It writes nothing, and fails unless every case's answer and score equal the committed mock
 *   run's (lib/eval/check.ts): the mock's answers are known, so it proves the scorer, not the
 *   model.
 * Real mode, by hand and with the owner's OK, since it spends money: AI_MODEL=<provider/model>
 * pnpm eval, with AI_GATEWAY_API_KEY set or the token `vercel env pull .env.local` writes
 * (.env.example). It writes measurements/eval-YYYY-MM-DD.json and never overwrites a good run of
 * the same day; a run that stops early writes measurements/eval-YYYY-MM-DD-HHMMSS.aborted.json
 * and fails.
 */
import { existsSync } from "node:fs";
import { checkRequested, evalCommand } from "@/lib/eval/command";

// Loaded the way Next.js loads it: variables already set in the shell win.
const ENV_FILE = ".env.local";

async function main(): Promise<void> {
  const check = checkRequested(process.argv.slice(2));
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  // Imported after the env file: lib/ai/model.ts reads AI_MOCK and AI_MODEL when it loads, and
  // the project's module may read the environment too.
  const { getModel, IS_MOCK, MODEL_LABEL } = await import("@/lib/ai/model");
  const { createScenarioMockModel } = await import("@/lib/ai/mock");
  const { EVAL_PROJECT } = await import("@/lib/eval/project");
  await evalCommand({
    check,
    mock: IS_MOCK,
    modelLabel: MODEL_LABEL,
    // The mock streams without delays, so CI runs the cases in seconds; the steps are the same.
    model: () =>
      IS_MOCK ? createScenarioMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0 }) : getModel(),
    project: EVAL_PROJECT,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

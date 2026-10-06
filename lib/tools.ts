import { tool } from "ai";
import { z } from "zod";

/**
 * The project's tools (template spec §5.10): what the chat route offers the model, each call
 * shown as a chip in the chat. Project-owned: a project replaces the sample with its own tools,
 * names each one in toolLabel (lib/i18n/messages.ts) and gives the mock a cue for it
 * (lib/ai/mock-scenarios.ts). Server-only.
 *
 * The template's tool is a sample to replace: a lookup of a fictional item by its id.
 */

/** The sample tool's name: its key in TOOLS, the name its label and the mock's cue use. */
export const SAMPLE_TOOL_NAME = "lookUpItem";

export type SampleItem = { id: string; name: string; status: string };

/** The fictional items the sample tool knows. An id is "ITM-" and four digits. */
export const SAMPLE_ITEMS: readonly SampleItem[] = [
  { id: "ITM-0042", name: "Brass desk lamp", status: "available" },
  { id: "ITM-0108", name: "Walnut bookshelf", status: "on loan" },
  { id: "ITM-0315", name: "Linen table runner", status: "in repair" },
];

/** What the sample tool answers: the item, or the id it was asked for when there is no such item. */
export type ItemLookup = { found: true; item: SampleItem } | { found: false; itemId: string };

/** Looks an item up by its id, written in any case, with spaces around it or not. */
export function lookUpItem(itemId: string): ItemLookup {
  const id = itemId.trim().toUpperCase();
  const item = SAMPLE_ITEMS.find((candidate) => candidate.id === id);
  return item === undefined ? { found: false, itemId: id } : { found: true, item };
}

/** The tools the chat route offers the model. */
export const TOOLS = {
  [SAMPLE_TOOL_NAME]: tool({
    description:
      "Look up one of this demo's fictional items by its id and get its name and status. An id is ITM- and four digits, such as ITM-0042.",
    inputSchema: z.object({
      itemId: z.string().describe("The item's id, such as ITM-0042."),
    }),
    execute: async ({ itemId }) => lookUpItem(itemId),
  }),
};

import { simulateReadableStream, type UIMessage, type UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStreamParts, buildToolCallParts, type MockStreamPart } from "@/lib/ai/mock";
import { SAFE_ERROR_MESSAGE } from "@/lib/chat/errors";
import { providerOptionsFor, streamAgentReply } from "./pipeline";

// The shared pipeline of the route and the eval (P2's spec §4.1–§4.3, P2-18): what it sends the
// model besides the history, and what a failed tool call leaves in the stream, which the browser
// and the eval post back on the continuation.

const HANDLE: UIMessage = {
  id: "u1",
  role: "user",
  parts: [{ type: "text", text: "Handle this request." }],
};

/** A model that plays the given steps in order, one per model call. */
function scripted(steps: MockStreamPart[][], modelId?: string): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    ...(modelId === undefined ? {} : { modelId }),
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: steps[Math.min(calls++, steps.length - 1)] }),
    }),
  });
}

async function chunksOf(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value);
  }
  return chunks;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Spec §4.2 and P2-18: parallel tool calls off where the provider allows it. P2's model is P1's,
// an OpenAI model through the AI Gateway, which passes provider options under the provider's
// name (@ai-sdk/gateway docs, "Provider-Specific Options"); the OpenAI provider documents
// `parallelToolCalls` (ai-sdk.dev, OpenAI provider options).
describe("provider options", () => {
  it("turn parallel tool calls off for an OpenAI model named as the Gateway names it", () => {
    expect(providerOptionsFor("openai/gpt-6-luna")).toEqual({
      openai: { parallelToolCalls: false },
    });
  });

  it("are none for another provider's model, or the mock", () => {
    expect(providerOptionsFor("anthropic/claude-sonnet-4.6")).toBeUndefined();
    expect(providerOptionsFor(new MockLanguageModelV4())).toBeUndefined();
  });

  it("reach the model on every call of an OpenAI model", async () => {
    const model = scripted([buildStreamParts(["Hello."])], "openai/gpt-6-luna");
    const { stream } = await streamAgentReply({ model, messages: [HANDLE], requestId: "r01" });
    await chunksOf(stream);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0].providerOptions).toEqual({
      openai: { parallelToolCalls: false },
    });
  });

  it("do not reach another model", async () => {
    const model = scripted([buildStreamParts(["Hello."])]);
    const { stream } = await streamAgentReply({ model, messages: [HANDLE], requestId: "r01" });
    await chunksOf(stream);
    expect(model.doStreamCalls[0].providerOptions?.openai).toBeUndefined();
  });
});

// The review's m05: a failed call's text is posted back on the continuation, so the route and
// the eval must stream the same one; the eval's operator gets the raw error on the side.
describe("a failed tool call", () => {
  const badInput = buildToolCallParts("call-1", "authorizeReturn", {
    orderId: "AO-10468",
    reason: "It doesn't fit.",
    amount: 149,
  });

  it("streams the route's safe text, never the raw error", async () => {
    const model = scripted([badInput, buildStreamParts(["Sorry."])]);
    const { stream } = await streamAgentReply({ model, messages: [HANDLE], requestId: "r01" });
    const failed = (await chunksOf(stream)).filter(({ type }) => type === "tool-input-error");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ toolCallId: "call-1", errorText: SAFE_ERROR_MESSAGE });
  });

  it("streams the same text when the caller watches the raw error", async () => {
    const seen: unknown[] = [];
    const model = scripted([badInput, buildStreamParts(["Sorry."])]);
    const { stream } = await streamAgentReply({
      model,
      messages: [HANDLE],
      requestId: "r01",
      onError: (error) => {
        seen.push(error);
      },
    });
    const failed = (await chunksOf(stream)).filter(({ type }) => type === "tool-input-error");
    expect(failed[0]).toMatchObject({ errorText: SAFE_ERROR_MESSAGE });
    expect(seen).toHaveLength(1);
    expect(String(seen[0])).toContain("amount");
  });
});

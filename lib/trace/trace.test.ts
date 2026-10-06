import {
  isStepCount,
  jsonSchema,
  readUIMessageStream,
  simulateReadableStream,
  streamText,
  tool,
  toUIMessageStream,
  type LanguageModelUsage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { buildStreamParts, buildToolCallParts, createMockModel } from "@/lib/ai/mock";
import { tokenUsage, traceMetadataOf, traceMetadataOnFinish, type TraceMetadata } from "./trace";

// An answer's tokens and latency (template spec §5.10): sent with the finish chunk of its stream,
// and read back from the message the chat or an eval run holds.

function usage(input?: number, output?: number, total?: number): LanguageModelUsage {
  return {
    inputTokens: input,
    inputTokenDetails: {
      noCacheTokens: input,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: output,
    outputTokenDetails: { textTokens: output, reasoningTokens: undefined },
    totalTokens: total,
  };
}

/** Every chunk of a UI message stream, in order. */
async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

/** The message the chunks build, as the chat builds it. */
async function finished(chunks: readonly UIMessageChunk[]): Promise<UIMessage> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let message: UIMessage | undefined;
  for await (const snapshot of readUIMessageStream({ stream })) message = snapshot;
  if (message === undefined) throw new Error("The stream held no message.");
  return message;
}

describe("tokenUsage", () => {
  it("keeps the three totals, and writes a count the provider did not report as null", () => {
    expect(tokenUsage(usage(1200, 80, 1280))).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      totalTokens: 1280,
    });
    expect(tokenUsage(usage(undefined, 80, undefined))).toEqual({
      inputTokens: null,
      outputTokens: 80,
      totalTokens: null,
    });
  });
});

describe("traceMetadataOnFinish", () => {
  it("sends nothing on a part other than the finish", () => {
    const metadata = traceMetadataOnFinish(0, () => 10);
    expect(metadata({ part: { type: "start" } })).toBeUndefined();
    expect(metadata({ part: { type: "text-delta", id: "t", text: "Hi" } })).toBeUndefined();
  });

  it("sends the answer's tokens and its whole milliseconds since it started on the finish", () => {
    const metadata = traceMetadataOnFinish(1000.2, () => 2834.9);
    const finish = {
      type: "finish" as const,
      finishReason: "stop" as const,
      rawFinishReason: "stop",
      totalUsage: usage(1200, 80, 1280),
    };
    expect(metadata({ part: finish })).toEqual({
      usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
      latencyMs: 1835,
    });
  });

  it("puts the trace on the finish chunk of a UI message stream, and on the message", async () => {
    const model = createMockModel({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: ["Hi ", "there"],
    });
    const result = streamText({ model, prompt: "Hello", maxOutputTokens: 100 });
    const chunks = await collect(
      toUIMessageStream({
        stream: result.stream,
        messageMetadata: traceMetadataOnFinish(performance.now()),
      }),
    );

    const finish = chunks.findLast((chunk) => chunk.type === "finish");
    const expected = tokenUsage(await result.totalUsage);
    expect(finish).toMatchObject({ messageMetadata: { usage: expected } });
    expect(chunks.filter((chunk) => "messageMetadata" in chunk)).toHaveLength(1);

    const trace = traceMetadataOf(await finished(chunks));
    expect(trace.usage).toEqual(expected);
    expect(trace.usage?.outputTokens).toBe(2);
    expect(Number.isInteger(trace.latencyMs)).toBe(true);
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sums the tokens of every step of an answer that calls a tool", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks:
            calls++ === 0
              ? buildToolCallParts("call-1", "lookUp", { id: "1" })
              : buildStreamParts(["Found ", "it."]),
        }),
      }),
    });
    const result = streamText({
      model,
      prompt: "Look it up",
      tools: {
        lookUp: tool({
          inputSchema: jsonSchema<{ id: string }>({
            type: "object",
            properties: { id: { type: "string" } },
          }),
          execute: async () => ({ found: true }),
        }),
      },
      stopWhen: isStepCount(5),
      maxOutputTokens: 100,
    });
    const chunks = await collect(
      toUIMessageStream({
        stream: result.stream,
        messageMetadata: traceMetadataOnFinish(performance.now()),
      }),
    );

    // The tool step's one token, then the answer's two.
    expect(traceMetadataOf(await finished(chunks)).usage?.outputTokens).toBe(3);
    expect(model.doStreamCalls).toHaveLength(2);
  });
});

describe("traceMetadataOf", () => {
  const trace: TraceMetadata = {
    usage: { inputTokens: 1200, outputTokens: 80, totalTokens: null },
    latencyMs: 1834,
  };

  function message(metadata?: unknown): UIMessage {
    return { id: "a", role: "assistant", parts: [], metadata };
  }

  it("reads the tokens and latency of a finished answer", () => {
    expect(traceMetadataOf(message(trace))).toEqual(trace);
  });

  it("reads them next to a project's own metadata", () => {
    expect(traceMetadataOf(message({ ...trace, retrieval: { topScore: 0.6 } }))).toEqual(trace);
  });

  it("gives null for what has not arrived yet", () => {
    expect(traceMetadataOf(message())).toEqual({ usage: null, latencyMs: null });
    expect(traceMetadataOf(message({ retrieval: {} }))).toEqual({ usage: null, latencyMs: null });
  });

  it.each([
    ["a usage that is not an object", { usage: "1280", latencyMs: "5" }],
    [
      "a usage with a count that is not a number",
      { usage: { inputTokens: "1", outputTokens: 1, totalTokens: 2 } },
    ],
    ["a usage with a count missing", { usage: { inputTokens: 1, outputTokens: 1 } }],
    ["a latency that is not a number", { latencyMs: null }],
  ])("gives null for %s", (_, metadata) => {
    expect(traceMetadataOf(message(metadata))).toEqual({ usage: null, latencyMs: null });
  });
});

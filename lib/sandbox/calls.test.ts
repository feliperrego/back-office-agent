import { describe, expect, it } from "vitest";
import {
  CLOSE_CODES,
  LETTER_SIZES,
  OUTCOMES,
  READ_TOOL,
  SHOE_SIZES,
  WRITE_INPUTS,
  WRITE_TOOLS,
  isWriteTool,
  normalizeOrderId,
  normalizeSize,
  outcomeOf,
  parseCall,
  parseVariant,
} from "./calls";

describe("the tools (spec §4.1, P2-09)", () => {
  it("are one read and three writes", () => {
    expect(READ_TOOL).toBe("readRequest");
    expect(WRITE_TOOLS).toEqual(["authorizeReturn", "changeItem", "closeRequest"]);
    expect(Object.keys(WRITE_INPUTS)).toEqual([...WRITE_TOOLS]);
    expect(isWriteTool("changeItem")).toBe(true);
    for (const name of [READ_TOOL, "lookUpItem", "constructor", "toString"]) {
      expect(isWriteTool(name), name).toBe(false);
    }
  });

  it("take no amount, destination or lines: code computes them (spec §3 B3, B4, P2-19)", () => {
    expect(Object.keys(WRITE_INPUTS.authorizeReturn.shape)).toEqual(["orderId", "reason"]);
    expect(Object.keys(WRITE_INPUTS.changeItem.shape)).toEqual([
      "orderId",
      "item",
      "newSize",
      "reason",
    ]);
    expect(Object.keys(WRITE_INPUTS.closeRequest.shape)).toEqual(["outcome", "code", "note"]);
    const extra = { orderId: "AO-10468", reason: "Doesn't fit.", amount: 1000 };
    expect(WRITE_INPUTS.authorizeReturn.safeParse(extra).success).toBe(false);
    const to = { orderId: "AO-10468", reason: "Doesn't fit.", to: "gift card" };
    expect(WRITE_INPUTS.authorizeReturn.safeParse(to).success).toBe(false);
  });

  it("cap the texts a model writes", () => {
    const reason = (length: number) => ({ orderId: "AO-10468", reason: "x".repeat(length) });
    expect(WRITE_INPUTS.authorizeReturn.safeParse(reason(300)).success).toBe(true);
    expect(WRITE_INPUTS.authorizeReturn.safeParse(reason(301)).success).toBe(false);
    expect(WRITE_INPUTS.authorizeReturn.safeParse(reason(0)).success).toBe(false);
    const note = (length: number) => ({
      outcome: "answered",
      code: "policy-question",
      note: "x".repeat(length),
    });
    expect(WRITE_INPUTS.closeRequest.safeParse(note(500)).success).toBe(true);
    expect(WRITE_INPUTS.closeRequest.safeParse(note(501)).success).toBe(false);
  });

  it("transform nothing, so the SDK's re-validation of an approved input sees it unchanged", () => {
    const input = { orderId: "ao 10468", reason: "Doesn't fit." };
    expect(WRITE_INPUTS.authorizeReturn.parse(input)).toEqual(input);
  });
});

describe("closeRequest's outcomes and closed list of codes (spec §3 B2, B6, B9, B11, §5)", () => {
  it("answers, declines or hands to manual handling, never escalates", () => {
    expect(OUTCOMES).toEqual(["answered", "declined", "manual"]);
  });

  it("gives each outcome its own codes, every code of spec §5's table among them", () => {
    expect(CLOSE_CODES).toEqual({
      answered: ["policy-question", "order-status"],
      declined: [
        "outside-window",
        "already-returned",
        "not-delivered-yet",
        "already-shipped",
        "not-on-account",
        "item-condition",
      ],
      manual: ["carrier-investigation", "defect-claim", "warranty-claim", "not-covered", "no-tool"],
    });
    const all = Object.values(CLOSE_CODES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("knows the outcome of each code", () => {
    expect(outcomeOf("order-status")).toBe("answered");
    expect(outcomeOf("item-condition")).toBe("declined");
    expect(outcomeOf("not-covered")).toBe("manual");
  });
});

describe("normalizeOrderId (P1's lib/support/tools.ts)", () => {
  it("reads an order id as a person or a model may write it", () => {
    for (const written of [
      "AO-10468",
      "ao-10468",
      " AO 10468 ",
      "#10468",
      "order 10468",
      "10468",
    ]) {
      expect(normalizeOrderId(written), written).toBe("AO-10468");
    }
  });

  it("leaves anything else trimmed and upper-cased, so it matches no order", () => {
    expect(normalizeOrderId(" ao-1046 ")).toBe("AO-1046");
    expect(normalizeOrderId("AO-10468; AO-10351")).toBe("AO-10468; AO-10351");
  });
});

describe("sizes (spec §3 B5)", () => {
  it("are letter sizes XS–XXL and shoe sizes 5–15 in half sizes", () => {
    expect(LETTER_SIZES).toEqual(["XS", "S", "M", "L", "XL", "XXL"]);
    expect(SHOE_SIZES[0]).toBe("5");
    expect(SHOE_SIZES).toContain("8.5");
    expect(SHOE_SIZES.at(-1)).toBe("15");
    expect(SHOE_SIZES).toHaveLength(21);
  });

  it("read a size in any case, with spaces around it", () => {
    expect(normalizeSize(" l ")).toBe("L");
    expect(normalizeSize("xl")).toBe("XL");
    expect(normalizeSize("8.5")).toBe("8.5");
    expect(normalizeSize("10")).toBe("10");
  });

  it("refuse anything else", () => {
    for (const written of ["Large", "Men's L", "L, Red", "4.5", "15.5", "8.25", "08", "", "XXXL"]) {
      expect(normalizeSize(written), written).toBeNull();
    }
  });

  it("find the size inside a variant, and the parts around it", () => {
    expect(parseVariant("Men's M, Black")).toEqual({ who: "Men's", size: "M", rest: ", Black" });
    expect(parseVariant("Women's M")).toEqual({ who: "Women's", size: "M", rest: "" });
    expect(parseVariant("Men's 10")).toEqual({ who: "Men's", size: "10", rest: "" });
    expect(parseVariant("Women's S, Blue")).toEqual({ who: "Women's", size: "S", rest: ", Blue" });
  });

  it("find no size in a colour or a length", () => {
    for (const variant of ["Green", "Slate gray", "Regular", "Men's Large", "Kids' M"]) {
      expect(parseVariant(variant), variant).toBeNull();
    }
  });
});

describe("parseCall", () => {
  it("validates a write's input and normalizes its order id and size", () => {
    expect(
      parseCall({
        toolCallId: "c1",
        toolName: "changeItem",
        input: {
          orderId: "ao-10583",
          item: "Acme Loft Insulated Jacket",
          newSize: "l",
          reason: "The customer asked for L.",
        },
      }),
    ).toEqual({
      toolCallId: "c1",
      toolName: "changeItem",
      input: {
        orderId: "AO-10583",
        item: "Acme Loft Insulated Jacket",
        newSize: "L",
        reason: "The customer asked for L.",
      },
    });
  });

  it("returns null for a read, an unknown tool or an input its schema refuses", () => {
    const input = { orderId: "AO-10468", reason: "Doesn't fit." };
    expect(parseCall({ toolCallId: "c1", toolName: "readRequest", input: {} })).toBeNull();
    expect(parseCall({ toolCallId: "c1", toolName: "refundOrder", input })).toBeNull();
    expect(parseCall({ toolCallId: "c1", toolName: "authorizeReturn", input: {} })).toBeNull();
    expect(
      parseCall({ toolCallId: "c1", toolName: "closeRequest", input: { outcome: "escalated" } }),
    ).toBeNull();
  });
});

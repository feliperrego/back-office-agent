import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readHelpCenter, type Article } from "@/lib/help-center/articles";

// The help center of spec §3: the nine articles it names, copied verbatim from P1
// (support-assistant content/help-center at f56063b, P2-25), whose texts Felipe approved for P1
// on 2026-10-02 (P1's P-03). The agent's instructions give them to the model verbatim (P2-16).
const articles = readHelpCenter();
const byId = new Map(articles.map((article) => [article.id, article]));

// Each article's SHA-256 at f56063b (`git show f56063b:content/help-center/<id>.md | shasum -a
// 256` in support-assistant): a change to any of them fails here.
const FROM_P1: Record<string, string> = {
  "changing-or-canceling-an-order":
    "f255f4a88b21e2cb0e89370305fb2895e8ea50019c7d03d0509602ed0375f41b",
  "contacting-support": "4da6aeda6514407e3e632e8c97603be001306c7ab9da28f5780791ee581fb7d9",
  "damaged-or-defective-items": "bc8e1dc765eba9a19ec790f29e9c5dc7bf1faa838587f8e49669fc84062c8949",
  exchanges: "931eb05d16521e3a88decd15b1cea8cab85d568ad5c8f30e838455c12c1f0e1d",
  "late-or-missing-packages": "bb3ac2dac887184531394c3bf3178e66fed1989d484a8c7917f41798eedf2116",
  refunds: "765ae4b90d8d94122deaf713499f83b116b65d027f5fe1cffde3d86f0625b3c6",
  returns: "f62b44b7d79dee026195362690115b825e2e17091c92624ac0d3b6cced6c1633",
  "shipping-options": "d0c1d89ad40a80ede08c7b26008d9c97d05a395040a2601712704168035f9a80",
  warranty: "3d94963afd82f3c903a157e51e3e5e4c8c972dc8b9a911d4057506558a609169",
};

/** Text as a reader compares it: every dash a hyphen, whitespace collapsed. */
function plain(text: string): string {
  return text.replace(/\p{Pd}/gu, "-").replace(/\s+/g, " ");
}

/** The article without its frontmatter. */
function body({ content }: Article): string {
  const lines = content.split("\n");
  return lines.slice(lines.indexOf("---", 1) + 1).join("\n");
}

function article(id: string): Article {
  const found = byId.get(id);
  if (!found) throw new Error(`No article ${id}`);
  return found;
}

describe("content/help-center (spec §3, P2-25)", () => {
  it("holds exactly the nine articles spec §3 names", () => {
    expect(articles.map(({ id }) => id)).toEqual(Object.keys(FROM_P1).sort());
  });

  it("holds each as P1 has it at f56063b, byte for byte", () => {
    for (const { id, content } of articles) {
      expect(createHash("sha256").update(content, "utf8").digest("hex"), id).toBe(FROM_P1[id]);
    }
  });
});

// The policies spec §3 sums up, in the words of the article that states each one.
const POLICIES: [string, string][] = [
  ["returns", "You can return an item within 30 days of its delivery."],
  ["returns", "Items must be unused and with the tags still attached."],
  ["returns", "You pay for return shipping, unless the item is defective."],
  [
    "refunds",
    "We refund your original payment method within 5 business days of your return arriving",
  ],
  ["refunds", "A member of our support team reviews and issues every refund."],
  [
    "changing-or-canceling-an-order",
    "You can change the shipping address or the items in an order until your order ships.",
  ],
  [
    "damaged-or-defective-items",
    "Inside the return window, you can send a defective item back at our cost",
  ],
  ["warranty", "covered for 1 year against manufacturing defects"],
  ["late-or-missing-packages", "more than 2 business days past its estimated delivery date"],
  ["shipping-options", "Monday to Friday except US federal holidays"],
  ["contacting-support", "We discuss an order only with the customer who placed it."],
];

describe("the policies spec §3 sums up", () => {
  it.each(POLICIES)("%s states: %s", (id, phrase) => {
    expect(plain(body(article(id)))).toContain(plain(phrase));
  });
});

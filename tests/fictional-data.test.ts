import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_CENTER_DIR, readHelpCenter } from "@/lib/help-center/articles";
import { REQUESTS_PATH } from "@/lib/sandbox/requests";
import { CUSTOMERS_PATH } from "@/lib/store/customers";

// The store, its customers and its orders are fictional, P1's (spec §2), and so are the requests
// they send (spec §5): every e-mail, URL and domain they name sits under the reserved .example
// domain, so none can point at a real company. Copied from P1's test at f56063b (P2-25), with
// P2's requests in place of P1's tickets.
const files = [
  ...readHelpCenter().map(({ file, content }) => ({ file: `${HELP_CENTER_DIR}/${file}`, content })),
  { file: CUSTOMERS_PATH, content: readFileSync(CUSTOMERS_PATH, "utf8") },
  { file: REQUESTS_PATH, content: readFileSync(REQUESTS_PATH, "utf8") },
];

// An e-mail address, whose domain is checked and whose local part ("maya.chen") is not.
const EMAIL = /[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
// A host name: labels joined by dots, ending in letters. A file name such as customers.json
// looks the same, so the repo's own data files are allowed by their extension.
const HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;
const FILE_NAME = /\.(?:json|md|ts|sha256)$/i;

/** The e-mail domains, then the other host names, that the text names. */
function hosts(text: string): string[] {
  const domains = [...text.matchAll(EMAIL)].map((match) => match[1]);
  const others = text.replace(EMAIL, " ").match(HOST) ?? [];
  return [...domains, ...others.filter((host) => !FILE_NAME.test(host))];
}

describe("the fictional data", () => {
  it("names hosts, e-mail domains and URLs only under .example", () => {
    for (const { file, content } of files) {
      const real = hosts(content).filter((host) => !host.toLowerCase().endsWith(".example"));
      expect(real, file).toEqual([]);
    }
  });

  it("names no product after a real outdoor product of the same kind (P1's D16)", () => {
    // Found by P1's web check of 2026-10-01: Talus packs (TETON Sports, REI, Marmot), the Ember
    // down quilt (Sea to Summit), Scree boots (Vasque, Trespass), Switchback poles (Black Diamond)
    // and Cirrus rain jackets. The house brand's products carry descriptive names instead.
    for (const { file, content } of files) {
      expect(content.match(/\b(?:Talus|Ember|Scree|Switchback|Cirrus)\b/g), file).toBeNull();
    }
  });

  it("finds the hosts it must check", () => {
    // Guards the patterns above: e-mail domains and links are both seen, local parts are not.
    expect(
      hosts("Write jane.doe@mail.example, support@shop.com or see https://acme-outfitters.com/x"),
    ).toEqual(["mail.example", "shop.com", "acme-outfitters.com"]);
    expect(hosts("Read tickets.json and returns.md, e.g. at 5.30 p.m.")).toEqual([]);
  });
});

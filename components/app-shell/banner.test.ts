import { describe, expect, it } from "vitest";
import { bannerParts } from "./banner";

// The app shell's banner may carry one link (P2's spec §1: "some of these requests came from
// Acme Outfitters Support", linking to P1). The project's sentence marks where it goes with
// {link}, so each language places it where its grammar wants it.

describe("bannerParts", () => {
  it("splits the sentence around {link}", () => {
    expect(bannerParts("Some came from {link}, and nothing changes.")).toEqual({
      before: "Some came from ",
      after: ", and nothing changes.",
    });
    expect(bannerParts("{link} first")).toEqual({ before: "", after: " first" });
  });

  it("finds no place for a link in a sentence without {link}", () => {
    expect(bannerParts("The data is fictional.")).toBeNull();
  });
});

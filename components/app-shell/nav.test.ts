import { describe, expect, it } from "vitest";
import { isCurrent } from "./nav";

// Which nav item marks the page the visitor is on (template spec §5.12).
describe("isCurrent", () => {
  it("marks an item on its own path and on every path below it", () => {
    expect(isCurrent("/evals", "/evals")).toBe(true);
    expect(isCurrent("/evals/c01", "/evals")).toBe(true);
  });

  it("does not mark an item on a path that only starts with its letters", () => {
    expect(isCurrent("/evalsx", "/evals")).toBe(false);
    expect(isCurrent("/other", "/evals")).toBe(false);
  });

  it('marks "/" on the home page only, never below it', () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/evals", "/")).toBe(false);
  });

  it("marks nothing before the router knows the path", () => {
    expect(isCurrent(null, "/")).toBe(false);
  });
});

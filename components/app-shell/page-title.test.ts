import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/project";
import { PAGE_TITLE_TEMPLATE, pageTitle } from "./page-title";

// A page's title in the browser tab (template spec §5.12): the served HTML gets it through the
// root layout's template, and a client page sets it in the interface language, so both must agree.
describe("pageTitle", () => {
  it("names the page, then the product", () => {
    expect(pageTitle("Evals")).toBe(`Evals · ${PRODUCT_NAME}`);
    expect(pageTitle("Caso c01")).toBe(`Caso c01 · ${PRODUCT_NAME}`);
  });

  it("is the root layout's title template with the page's name in Next's %s", () => {
    expect(PAGE_TITLE_TEMPLATE.split("%s")).toHaveLength(2);
    expect(PAGE_TITLE_TEMPLATE.replace("%s", "Case c01")).toBe(pageTitle("Case c01"));
  });
});

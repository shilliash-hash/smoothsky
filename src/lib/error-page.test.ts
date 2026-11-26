import { describe, expect, it } from "vitest";
import { shouldRenderHtmlErrorPage } from "./error-page";

describe("error response boundary", () => {
  it("uses the HTML fallback only for page requests", () => {
    expect(shouldRenderHtmlErrorPage("router")).toBe(true);
  });

  it("preserves server-function errors for the RPC client", () => {
    expect(shouldRenderHtmlErrorPage("serverFn")).toBe(false);
  });
});

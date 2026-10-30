import { describe, expect, it } from "vitest";

import { contentHash, hashHtml, normalizeHtml } from "../src/normalize.js";

describe("normalizeHtml", () => {
  it("collapses line endings and whitespace runs deterministically", () => {
    const normalized = normalizeHtml(
      "<html>\r\n  <body>  <p>hi   there</p>\r\n\r\n\r\n</body>\t</html>\r\n",
    );
    expect(normalized).toBe("<html>\n<body> <p>hi there</p>\n</body> </html>");
  });
});

describe("contentHash", () => {
  // Golden vector pins the normalization + hashing pair against change.
  const GOLDEN_INPUT = "<html>\r\n  <body>  <p>hi   there</p>\r\n\r\n\r\n</body>\t</html>\r\n";
  const GOLDEN_HASH = "56938463dd145fa11f298fc2393af429ec94b05e698de3d98eb6a5358f6190f9";

  it("matches the pinned sha256 vector", () => {
    expect(hashHtml(GOLDEN_INPUT)).toBe(GOLDEN_HASH);
  });

  it("is insensitive to line-ending and whitespace-only differences", () => {
    expect(hashHtml("<p>a</p>\r\n<p>b</p>")).toBe(hashHtml("<p>a</p>\n<p>b</p>"));
  });

  it("changes when content changes", () => {
    expect(hashHtml("<p>a</p>")).not.toBe(hashHtml("<p>b</p>"));
  });

  it("exposes the raw digest for pre-normalized input", () => {
    expect(contentHash(normalizeHtml("<p>a</p>"))).toBe(hashHtml("<p>a</p>"));
  });
});

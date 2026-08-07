import { describe, expect, it } from "vitest";
import {
  buildTitleTranscript,
  fallbackTitleFromMessages,
  messageText,
  sanitizeTitle,
} from "./title";

describe("messageText", () => {
  it("joins text parts", () => {
    expect(
      messageText({
        role: "user",
        content: [
          { type: "text", text: "Captain " },
          { type: "text", text: "for GW32?" },
          { type: "image", image: "x" },
        ],
      }),
    ).toBe("Captain for GW32?");
  });
});

describe("buildTitleTranscript", () => {
  it("formats roles and skips empty content", () => {
    expect(
      buildTitleTranscript([
        { role: "user", content: [{ type: "text", text: "Who to captain?" }] },
        { role: "assistant", content: [{ type: "tool-call", toolName: "x" }] },
        {
          role: "assistant",
          content: [{ type: "text", text: "I'd lean Palmer." }],
        },
      ]),
    ).toBe("user: Who to captain?\nassistant: I'd lean Palmer.");
  });
});

describe("sanitizeTitle", () => {
  it("strips quotes and labels", () => {
    expect(sanitizeTitle('"GW32 captain picks"')).toBe("GW32 captain picks");
    expect(sanitizeTitle("Title: Salah vs Palmer")).toBe("Salah vs Palmer");
  });

  it("truncates long titles", () => {
    const long = "a".repeat(80);
    const result = sanitizeTitle(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(60);
    expect(result!.endsWith("…")).toBe(true);
  });
});

describe("fallbackTitleFromMessages", () => {
  it("uses the first user message", () => {
    expect(
      fallbackTitleFromMessages([
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Build a wildcard squad" }],
        },
      ]),
    ).toBe("Build a wildcard squad");
  });

  it("falls back when empty", () => {
    expect(fallbackTitleFromMessages([])).toBe("New conversation");
  });
});

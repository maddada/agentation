import { describe, expect, it } from "vitest";
import { generateOutput } from "./generate-output";
import { getStorageKey, loadAnnotations, saveAnnotations } from "./storage";
import type { Annotation } from "../types";

const base = (id: string, screenshot?: string): Annotation => ({
  id, x: 10, y: 20, comment: `note ${id}`, element: "button", elementPath: "main > button",
  timestamp: Date.now(), screenshot,
});

describe("screenshot references in the output", () => {
  it("numbers only annotations that have a picture", () => {
    const output = generateOutput([base("a", "data:x"), base("b"), base("c", "data:y")], "/page", "standard", {
      screenshotReference: (a, n) => `[Image #${n}](${a.id})`,
    });
    expect(output).toContain("**Screenshot:** [Image #1](a)");
    expect(output).toContain("**Screenshot:** [Image #2](c)");
    expect(output.match(/Screenshot/g)).toHaveLength(2);
  });

  it("adds the reference to compact lines", () => {
    const output = generateOutput([base("a", "data:x")], "/page", "compact", {
      screenshotReference: (_a, n) => `[Image #${n}](p)`,
    });
    expect(output).toContain("note a [Image #1](p)");
  });

  it("leaves the output unchanged without a reference callback", () => {
    expect(generateOutput([base("a", "data:x")], "/page")).not.toContain("Screenshot");
  });
});

describe("saving annotations with screenshots", () => {
  it("keeps the notes without their pictures when storage is full", () => {
    const original = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (key: string, value: string) {
      calls += 1;
      if (value.includes("data:image")) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
    try {
      saveAnnotations("/quota", [base("a", "data:image/png;base64,AAAA")]);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(calls).toBe(2);
    const saved = loadAnnotations<Annotation>("/quota");
    expect(saved[0].comment).toBe("note a");
    expect(saved[0].screenshot).toBeUndefined();
    localStorage.removeItem(getStorageKey("/quota"));
  });
});

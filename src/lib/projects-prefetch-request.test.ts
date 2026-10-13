import { describe, expect, it } from "vitest";
import { isProjectsPrefetchRequest } from "./projects-prefetch-request";

describe("read-only Projects speculation", () => {
  it("matches only speculative list GETs, including filtered URLs by pathname", () => {
    expect(isProjectsPrefetchRequest("/projects", "GET", new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isProjectsPrefetchRequest("/projects", "GET", new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isProjectsPrefetchRequest("/projects", "GET", new Headers())).toBe(false);
    expect(isProjectsPrefetchRequest("/projects", "POST", new Headers({ "next-router-prefetch": "1" }))).toBe(false);
    expect(isProjectsPrefetchRequest("/projects/id", "GET", new Headers({ "next-router-prefetch": "1" }))).toBe(false);
    expect(isProjectsPrefetchRequest("/statistics", "GET", new Headers({ "next-router-prefetch": "1" }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createSubmissionSchema } from "@/lib/validation/submission";

const base = { title: "Printer", description: "Replace the office printer", anonymous: false };

describe("submission creation validation", () => {
  it("requires a supported category for requests", () => {
    expect(createSubmissionSchema.safeParse({ ...base, type: "request", requestCategory: "equipment" }).success).toBe(true);
    expect(createSubmissionSchema.safeParse({ ...base, type: "request", requestCategory: null }).success).toBe(false);
  });

  it("keeps categories off suggestions and complaints", () => {
    expect(createSubmissionSchema.safeParse({ ...base, type: "suggestion", requestCategory: null }).success).toBe(true);
    expect(createSubmissionSchema.safeParse({ ...base, type: "complaint", requestCategory: null, anonymous: true }).success).toBe(true);
    expect(createSubmissionSchema.safeParse({ ...base, type: "suggestion", requestCategory: "office" }).success).toBe(false);
  });
});

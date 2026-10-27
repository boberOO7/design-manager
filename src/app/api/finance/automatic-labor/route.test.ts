import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/lib/finance-automatic-labor", () => ({ processAutomaticLabor: mocks.process }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("requires the worker secret before processing payroll", async () => {
  vi.stubEnv("CRON_SECRET", "secret");
  expect((await GET(new Request("http://localhost"))).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
});
it("reports failed candidates as a failed scheduled run while retaining progress", async () => {
  vi.stubEnv("CRON_SECRET", "secret");
  mocks.process.mockResolvedValue({ processed: 2, failed: 1 });
  const response = await GET(new Request("http://localhost", { headers: { authorization: "Bearer secret" } }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ processed: 2, failed: 1 });
});

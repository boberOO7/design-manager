import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bulkMove: vi.fn() }));
vi.mock("@/data/mutations/task-status", () => ({ bulkMoveTaskStatusesMutation: mocks.bulkMove }));
import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

it("returns the bulk transition error without masking useful database validation", async () => {
  mocks.bulkMove.mockResolvedValue({ success: false, formError: "Complete every checklist item before moving this batch to Done" });
  const request = new Request("http://localhost/api/projects/project-id/tasks/bulk-status", {
    method: "PATCH",
    body: JSON.stringify({ stage: "stage_1", source_statuses: ["todo"], target_status: "completed", task_ids: ["81000000-0000-0000-0000-000000000030"] }),
  });

  const response = await PATCH(request, { params: Promise.resolve({ projectId: "project-id" }) });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ success: false, formError: "Complete every checklist item before moving this batch to Done" });
});

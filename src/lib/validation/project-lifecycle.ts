import { z } from "zod";
import { PROJECT_LIFECYCLE_STATUSES } from "@/lib/project-lifecycle";

export const projectLifecycleStatusPayloadSchema = z.object({
  status: z.enum(PROJECT_LIFECYCLE_STATUSES.slice(0, 4)),
}).strict();

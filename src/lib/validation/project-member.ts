import { z } from "zod";
import { studioMemberActionSchema } from "@/lib/validation/team-membership";

const idSchema = z.uuid("Enter a valid identifier");

export const addProjectMemberSchema = z.object({
  projectId: idSchema,
  profileId: idSchema,
});

export const removeProjectMemberSchema = z.object({
  assignmentId: idSchema,
  projectId: idSchema,
});

export const removeProjectMemberWithWorkSchema = removeProjectMemberSchema.extend({
  userId: idSchema,
  allowUnassigned: studioMemberActionSchema.shape.allowUnassigned,
  reassignments: studioMemberActionSchema.shape.reassignments,
});

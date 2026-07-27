import { z } from "zod";

const idSchema = z.uuid("Enter a valid identifier");

export const addProjectMemberSchema = z.object({
  projectId: idSchema,
  profileId: idSchema,
});

export const removeProjectMemberSchema = z.object({
  assignmentId: idSchema,
  projectId: idSchema,
});

import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().refine(
  (value) => {
    if (!datePattern.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  },
  "Enter a valid date",
);

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(200, "Project name is too long"),
    project_code: z.string().trim().max(50, "Project code is too long"),
    client_name: z.string().trim().max(200, "Client name is too long"),
    description: z.string().trim().max(5000, "Description is too long"),
    total_area_m2: z
      .number({ error: "Enter a valid total area" })
      .positive("Total area must be greater than zero"),
    status: z.enum(["planned", "active", "paused", "completed"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    start_date: dateSchema,
    due_date: z.union([z.literal(""), dateSchema]),
  })
  .superRefine((project, context) => {
    if (project.due_date && project.due_date < project.start_date) {
      context.addIssue({
        code: "custom",
        message: "Due date cannot be earlier than the start date",
        path: ["due_date"],
      });
    }
  });

export type ProjectFormValues = z.infer<typeof projectSchema>;

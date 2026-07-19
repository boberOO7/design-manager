import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid studio email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

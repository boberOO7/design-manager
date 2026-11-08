import { z } from "zod";

const phone = z.string().trim().min(1).max(80).regex(/^\+?[0-9() .-]+$/)
  .refine(value => {
    const digits = value.replace(/\D/g, "").replace(/^00/, "");
    return digits.length >= 7 && digits.length <= 15;
  });

export const spaceDesignPayload = z.strictObject({
  schema_version: z.literal(1),
  submission_id: z.uuid().transform(value => value.toLowerCase()),
  submitted_at: z.iso.datetime({ offset: true }),
  form_id: z.union([z.literal(3032), z.literal(7153)]),
  form_location: z.enum(["footer", "modal"]),
  language: z.enum(["uk", "en", "pl"]),
  page_url: z.url().max(2000).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }),
  client_name: z.string().trim().min(1).max(200),
  phone: phone.nullable(),
  email: z.string().trim().max(320).pipe(z.email()).transform(value => value.toLowerCase()).nullable(),
}).refine(value => value.phone !== null || value.email !== null)
  .refine(value => value.form_id === 3032 ? value.form_location === "footer" : value.form_location === "modal");

export type SpaceDesignPayload = z.infer<typeof spaceDesignPayload>;

import "server-only";
import { z } from "zod";
import { getActiveStudioAdmin } from "@/data/queries/active-studio-admin";
import { getFinanceMovementHistory } from "@/data/queries/finance";
import { createClient } from "@/lib/supabase/server";

const allocationSchema = z.object({
  id: z.uuid(), expected_item_id: z.uuid(), movement_id: z.uuid(), amount: z.string(), payment_amount: z.string(),
  payment_currency: z.string(), obligation_currency: z.string(), settlement_rate: z.string().nullable(),
  settlement_source: z.string().nullable(), settlement_effective_date: z.string().nullable(), released_allocation_id: z.uuid().nullable(), reason: z.string(),
});
const expectedSchema = z.object({ id: z.uuid(), description: z.string().nullable(), currency: z.string().nullable(), direction: z.string().nullable() });
const projectSchema = z.object({ expected_item_id: z.uuid(), project: z.object({ name: z.string() }).nullable() });

export async function getFinanceSourceMovement(id: string) {
  const admin = await getActiveStudioAdmin();
  if (!admin || !z.uuid().safeParse(id).success) return null;
  const movements = await getFinanceMovementHistory(id);
  if (!movements.some(movement => movement.id === id)) return null;
  const movementIds = movements.map(movement => movement.id);
  const client = await createClient();
  const allocations: z.infer<typeof allocationSchema>[] = [];
  for (let start = 0; start < movementIds.length; start += 50) {
    for (let offset = 0; ; offset += 1000) {
      const page = await client.from("finance_allocations").select("id,expected_item_id,movement_id,amount::text,payment_amount::text,payment_currency,obligation_currency,settlement_rate::text,settlement_source,settlement_effective_date,released_allocation_id,reason")
        .eq("studio_id", admin.studio_id).in("movement_id", movementIds.slice(start, start + 50)).order("created_at").order("id").range(offset, offset + 999);
      if (page.error) throw new Error("Unable to load source movement matches.", { cause: page.error });
      allocations.push(...z.array(allocationSchema).parse(page.data));
      if (page.data.length < 1000) break;
    }
  }
  const expectedIds = [...new Set(allocations.map(allocation => allocation.expected_item_id))];
  const expectedRows: z.infer<typeof expectedSchema>[] = [];
  const projectRows: z.infer<typeof projectSchema>[] = [];
  for (let start = 0; start < expectedIds.length; start += 50) {
    const batch = expectedIds.slice(start, start + 50);
    const [expected, projects] = await Promise.all([
      client.from("finance_expected_balances").select("id,description,currency,direction").eq("studio_id", admin.studio_id).in("id", batch),
      client.from("finance_project_items").select("expected_item_id,project:projects!finance_project_items_project_id_studio_id_fkey(name)").eq("studio_id", admin.studio_id).in("expected_item_id", batch),
    ]);
    if (expected.error || projects.error) throw new Error("Unable to load matched Finance sources.", { cause: expected.error ?? projects.error });
    expectedRows.push(...z.array(expectedSchema).parse(expected.data));
    projectRows.push(...z.array(projectSchema).parse(projects.data));
  }
  const expectedById = new Map(expectedRows.map(item => [item.id, item]));
  const projectById = new Map(projectRows.map(item => [item.expected_item_id, item.project?.name ?? null]));
  const matches = z.array(allocationSchema).parse(allocations).map(allocation => ({
    ...allocation,
    source: expectedById.get(allocation.expected_item_id) ?? null,
    projectName: projectById.get(allocation.expected_item_id) ?? null,
  }));
  return { id, movements, matches };
}

export type FinanceSourceMovement = NonNullable<Awaited<ReturnType<typeof getFinanceSourceMovement>>>;

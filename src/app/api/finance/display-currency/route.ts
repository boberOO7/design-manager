import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { financeDisplayCurrencySchema } from "@/lib/finance-display-currency";

export async function PATCH(request: Request) {
  const client = await createClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const currency = financeDisplayCurrencySchema.safeParse(body && typeof body === "object" && "currency" in body ? body.currency : null);
  if (!currency.success) return NextResponse.json({ error: "Unsupported currency." }, { status: 400 });
  const { error } = await client.auth.updateUser({ data: { finance_display_currency: currency.data } });
  if (error) return NextResponse.json({ error: "Unable to save currency." }, { status: 400 });
  return NextResponse.json({ currency: currency.data });
}

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { financeDisplayCurrency } from "@/lib/finance-display-currency";

export const getFinanceDisplayCurrency = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return "USD";
  return financeDisplayCurrency(data.user.user_metadata?.finance_display_currency);
});

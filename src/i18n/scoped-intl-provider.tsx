"use client";

import { NextIntlClientProvider, useLocale, useMessages, type AbstractIntlMessages } from "next-intl";
import { useMemo, type ReactNode } from "react";

export function ScopedIntlProvider({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const inherited = useMessages();
  const locale = useLocale();
  // Merge in context, so ancestor messages aren't serialized again at each boundary.
  const merged = useMemo(() => ({ ...inherited, ...messages }), [inherited, messages]);
  return <NextIntlClientProvider locale={locale} messages={merged}>{children}</NextIntlClientProvider>;
}

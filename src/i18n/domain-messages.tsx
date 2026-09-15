import "server-only";

import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { messageScopes, selectMessages } from "@/i18n/message-scopes";
import { ScopedIntlProvider } from "@/i18n/scoped-intl-provider";

export async function DomainMessages({ scope, children }: { scope: keyof typeof messageScopes; children: ReactNode }) {
  return <ScopedIntlProvider messages={selectMessages(await getMessages(), scope)}>{children}</ScopedIntlProvider>;
}

"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const WorkLogDialog = dynamic(() => import("./work-log-dialog").then(module => module.WorkLogDialog));

export function WorkLogTrigger() {
  const t = useTranslations("WorkLog");
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="ghost" size="compact" aria-label={t("entry")} onClick={() => setOpen(true)}>
      <Clock3 aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{t("entry")}</span>
    </Button>
    {open ? <WorkLogDialog onClose={() => setOpen(false)} /> : null}
  </>;
}

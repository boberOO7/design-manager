"use client";

import { FormField, Input, Textarea } from "@/components/ui/form-field";
import { Select, SelectItem } from "@/components/ui/select";
import type { CrmAdmin } from "@/data/queries/crm";

export function TextField({ autoComplete, defaultValue, error, initialFocus = false, label, name, placeholder, required = false, type = "text" }: { autoComplete?: string; defaultValue?: string | null; error?: string; initialFocus?: boolean; label: string; name: string; placeholder?: string; required?: boolean; type?: React.HTMLInputTypeAttribute }) {
  return <FormField label={label} error={error} optional={!required}><Input autoComplete={autoComplete} data-dialog-initial-focus={initialFocus || undefined} defaultValue={defaultValue ?? ""} name={name} placeholder={placeholder} required={required} type={type} aria-invalid={Boolean(error)} /></FormField>;
}

export function NotesField({ defaultValue, error, label, name, rows = 3 }: { defaultValue?: string | null; error?: string; label: string; name: string; rows?: number }) {
  return <FormField label={label} error={error} optional><Textarea defaultValue={defaultValue ?? ""} name={name} rows={rows} aria-invalid={Boolean(error)} /></FormField>;
}

export function AdminField({ admins, defaultValue, emptyLabel, label }: { admins: CrmAdmin[]; defaultValue?: string | null; emptyLabel: string; label: string }) {
  return <FormField label={label} optional as="div"><Select name="responsible_admin_id" defaultValue={defaultValue ?? ""} placeholder={emptyLabel}><SelectItem value="">{emptyLabel}</SelectItem>{admins.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}</Select></FormField>;
}

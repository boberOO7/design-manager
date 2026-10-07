"use client";

import { Select, SelectItem } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { TaskCollaborator } from "@/types/tasks";

export function TaskPersonSelect({ people, value, emptyLabel, label, disabled, onChange, roleLabel }: {
  people: Array<Pick<TaskCollaborator, "id" | "full_name"> & Partial<Pick<TaskCollaborator, "avatar_url" | "job_title">>>;
  value: string;
  emptyLabel?: string;
  label: string;
  disabled: boolean;
  onChange: (id: string) => void;
  roleLabel?: (role: string) => string;
}) {
  return <Select aria-label={label} value={value} disabled={disabled} onValueChange={onChange} className="[&>span:last-child]:border-l-0">
    {emptyLabel ? <SelectItem value=""><span className="font-normal text-[var(--ui-text-muted)]">{emptyLabel}</span></SelectItem> : null}
    {people.map((person) => <SelectItem key={person.id} value={person.id} textValue={person.full_name}>
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <UserAvatar decorative imageUrl={person.avatar_url} name={person.full_name} size="boardCard" />
        <span className="min-w-0 truncate">{person.full_name}{person.job_title && roleLabel ? <span className="font-normal text-[var(--ui-text-muted)]"> — {roleLabel(person.job_title)}</span> : null}</span>
      </span>
    </SelectItem>)}
  </Select>;
}

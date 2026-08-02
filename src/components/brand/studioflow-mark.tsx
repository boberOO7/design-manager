import { cn } from "@/lib/utils";

export function StudioFlowMark({ className }: { className?: string }) {
  return (
    <svg
      width="29"
      height="28"
      viewBox="0 0 29 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("inline-block h-6 w-auto shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M28.7112 27.1876L13.0581 0L5.30896 13.5224L7.07068 14.808L0 27.1876H28.7112ZM13.0581 4.7495L24.4736 24.5807L8.40387 12.8558L13.0581 4.7495ZM8.98714 16.2126L20.7835 24.8188H4.07099L8.98714 16.2126Z"
        fill="currentColor"
      />
    </svg>
  );
}

import { z } from "zod";

// Keep causes intact for operators; scheduled/public responses stay generic.
export function catalogError(context: string, cause: unknown) {
  return new Error(context, { cause });
}

export function formatCatalogError(error: unknown, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const secrets = Object.entries(env)
    .filter(([key, value]) => value && /token|secret|password|credential|api.?key|_key$|username/i.test(key))
    .flatMap(([, value]) => value ? [value, encodeURIComponent(value)] : []);
  if (env.ICECAT_USERNAME && env.ICECAT_PASSWORD) {
    secrets.push(Buffer.from(`${env.ICECAT_USERNAME}:${env.ICECAT_PASSWORD}`).toString("base64"));
  }
  secrets.sort((a, b) => b.length - a.length);
  const redact = (value: string) => {
    for (const secret of secrets) value = value.replaceAll(secret, "[redacted]");
    return value.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+/gi, "[redacted URL]")
      .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [redacted]")
      .replace(/\b((?:api[-_]?token|token|password|secret|authorization|api[-_]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
      .replace(/<[!?/a-z][^>]*(?:>|$)/gi, "[XML omitted]")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .slice(0, 1800);
  };
  const lines: string[] = [];
  const visited = new Set<unknown>();
  for (let depth = 0; error != null && depth < 8 && !visited.has(error); depth++) {
    visited.add(error);
    // Zod issues contain useful attribute paths without dumping the input object.
    let detail: string;
    if (error instanceof z.ZodError) {
      detail = redact(error.issues.map(issue => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; "));
    } else if (error instanceof Error) {
      const frames = error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 6).join("\n") ?? "";
      detail = `${redact(`${error.name}: ${error.message}`).slice(0, 1000)}\n${redact(frames).slice(0, 800)}`;
    } else {
      // SDKs can throw plain objects. Only display scalar diagnostic fields.
      detail = redact(typeof error === "object"
        ? Object.entries(error).filter(([key, value]) => ["name", "message", "code", "hint"].includes(key) && typeof value === "string").map(([key, value]) => `${key}: ${value}`).join("; ") || "Non-Error failure"
        : String(error));
    }
    lines.push(`${depth ? "Caused by: " : ""}${detail}`);
    error = error instanceof Error ? error.cause : undefined;
  }
  return lines.join("\n").slice(0, 16000);
}

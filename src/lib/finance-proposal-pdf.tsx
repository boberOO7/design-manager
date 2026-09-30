import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { ProposalDocument } from "@/components/finance/proposal/document";
import type { ProposalSnapshot } from "./finance-proposal";

Font.register({ family: "ProposalUbuntu", fonts: [
  { src: join(process.cwd(), "public/fonts/Ubuntu-Regular.ttf"), fontWeight: 400 },
  { src: join(process.cwd(), "public/fonts/Ubuntu-Medium.ttf"), fontWeight: 500 },
] });
Font.registerHyphenationCallback((word) => [word]);
const logoPath = readFileSync(join(process.cwd(), "public/space-logo-full-theme.svg"), "utf8").match(/<path d="([^"]+)"/)?.[1];
if (!logoPath) throw new Error("SPACE proposal logo is missing");

export function renderProposalPdf(snapshot: ProposalSnapshot) {
  if (!logoPath) throw new Error("SPACE proposal logo is missing");
  return renderToBuffer(<ProposalDocument snapshot={snapshot} logoPath={logoPath}/>);
}

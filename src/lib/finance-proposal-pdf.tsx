import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { ProposalDocument } from "@/components/finance/proposal/document";
import { DesignProposalDocument } from "@/components/finance/proposal/design-document";
import { resolveProposalDesignVariant, type ProposalSnapshot } from "./finance-proposal";

Font.register({ family: "ProposalUbuntu", fonts: [
  { src: join(process.cwd(), "public/fonts/Ubuntu-Regular.ttf"), fontWeight: 400 },
  { src: join(process.cwd(), "public/fonts/Ubuntu-Medium.ttf"), fontWeight: 500 },
] });
const fonts = join(process.cwd(), "public/fonts");
if (!Font.getRegisteredFontFamilies().includes("DesignUbuntu")) Font.register({ family: "DesignUbuntu", fonts: [
  { src: join(fonts, "Ubuntu-Regular.ttf"), fontWeight: 400 },
  { src: join(fonts, "Ubuntu-Medium.ttf"), fontWeight: 500 },
] });
for (const [family, file] of [["DesignSerif", "IBMPlexSerif-Regular.ttf"], ["DesignSpaceMono", "SPACE-DesignMono.ttf"], ["DesignGeometry", "Jura-Medium.ttf"]]) {
  if (!Font.getRegisteredFontFamilies().includes(family)) Font.register({ family, src: join(fonts, "proposal-designs", file) });
}
Font.registerHyphenationCallback((word) => [word]);
// Fontkit may first cache Latin glyphs as unmapped components of Cyrillic glyphs
// while subsetting an earlier PDF. Prime their mappings before rendering any PDF.
const fontPreparation = Promise.all([
  { fontFamily: "ProposalUbuntu", fontWeight: 400 },
  { fontFamily: "ProposalUbuntu", fontWeight: 500 },
  { fontFamily: "DesignUbuntu", fontWeight: 400 },
  { fontFamily: "DesignUbuntu", fontWeight: 500 },
  ...["DesignSerif", "DesignSpaceMono", "DesignGeometry"].map(fontFamily => ({ fontFamily })),
].map(async descriptor => {
  await Font.load(descriptor);
  const font = Font.getFont(descriptor)?.data;
  for (let code = 32; code <= 126; code++) {
    const glyph = font?.glyphForCodePoint(code);
    if (glyph && glyph.codePoints.length === 0) glyph.codePoints.push(code);
  }
}));
const logoPath = readFileSync(join(process.cwd(), "public/space-logo-full-theme.svg"), "utf8").match(/<path d="([^"]+)"/)?.[1];
if (!logoPath) throw new Error("SPACE proposal logo is missing");

export async function renderProposalPdf(snapshot: ProposalSnapshot) {
  await fontPreparation;
  if (!logoPath) throw new Error("SPACE proposal logo is missing");
  const variant = resolveProposalDesignVariant(snapshot);
  return renderToBuffer(variant === "classic"
    ? <ProposalDocument snapshot={snapshot} logoPath={logoPath}/>
    : <DesignProposalDocument snapshot={snapshot} logoPath={logoPath} variant={variant}/>);
}

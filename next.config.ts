import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF font engine in Node; bundling it corrupts Latin glyphs.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/projects/*/proposals": ["./public/fonts/**/*.ttf", "./public/space-logo-full-theme.svg"],
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);

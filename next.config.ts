import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local browser tests use this origin for Next's development HMR connection.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Service-Worker-Allowed", value: "/" },
    ] }];
  },
  // Keep the PDF font engine in Node; bundling it corrupts Latin glyphs.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/projects/*/proposals": ["./public/fonts/**/*.ttf", "./public/space-logo-full-theme.svg"],
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);

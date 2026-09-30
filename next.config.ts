import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/projects/*/proposals": ["./public/fonts/*.ttf", "./public/space-logo-full-theme.svg"],
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);

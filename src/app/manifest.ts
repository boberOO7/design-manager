import type { MetadataRoute } from "next";
import { LIGHT_THEME_COLOR } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "StudioFlow", short_name: "StudioFlow", lang: "uk",
    description: "Робочий простір студії", start_url: "/dashboard", scope: "/",
    display: "standalone", background_color: LIGHT_THEME_COLOR, theme_color: LIGHT_THEME_COLOR,
    icons: [
      { src: "/icons/studioflow-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/studioflow-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/studioflow-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR, themeBootstrapScript } from "@/lib/theme";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return {
  title: "StudioFlow",
  description: t("tagline"),
  icons: {
    icon: [
      {
        url: "/favicon-light.svg",
        media: "(prefers-color-scheme: light)",
        type: "image/svg+xml",
      },
      {
        url: "/favicon-dark.svg",
        media: "(prefers-color-scheme: dark)",
        type: "image/svg+xml",
      },
    ],
  },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full bg-[var(--ui-page)] font-sans text-[var(--ui-text)]">
        <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

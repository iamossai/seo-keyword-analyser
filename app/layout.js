import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "SEO Keyword Analyser — AI Headline, Keywords & Structure",
  description:
    "Paste any article and get an AI-optimized headline, a full keyword strategy (primary, secondary, semantic & question keywords), and concrete structure recommendations based on modern on-page SEO standards.",
  metadataBase: new URL("https://example.com"),
  openGraph: {
    title: "SEO Keyword Analyser",
    description:
      "AI-powered on-page SEO: better headlines, keyword strategy, and structure fixes.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  themeColor: "#f6f8fc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

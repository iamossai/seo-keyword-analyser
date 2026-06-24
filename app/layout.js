import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "SEO Keyword Analyser — Quick Pre-Publish Check for News Stories",
  description:
    "Paste your news story and get the few fixes that matter most before you publish: a better headline, the right keywords, the search snippet, and a quick pre-publish checklist.",
  metadataBase: new URL("https://seo-keyword-analyser.vercel.app"),
  openGraph: {
    title: "SEO Keyword Analyser",
    description:
      "Quick pre-publish SEO check for news stories: headline, keywords, search snippet, and a checklist.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "SEO Keyword Analyser",
    description: "Quick pre-publish SEO check for news stories.",
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

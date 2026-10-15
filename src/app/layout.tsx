import type { Metadata } from "next";
import { env } from "../lib/env";
import "./globals.css";

const DESCRIPTION =
  "One dated edition a day of software and computer science: articles, releases, repos, discussion, papers, and a concept worth knowing.";

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: "The Daily Stack",
  description: DESCRIPTION,
  applicationName: "The Daily Stack",
  alternates: {
    types: { "application/atom+xml": [{ url: "/feed.xml", title: "The Daily Stack" }] },
  },
  openGraph: {
    type: "website",
    siteName: "The Daily Stack",
    title: "The Daily Stack",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary", title: "The Daily Stack", description: DESCRIPTION },
};

/**
 * Applies a stored theme before first paint. The stylesheet already honours
 * `prefers-color-scheme`, so the absence of a stored choice is the correct
 * default and this only runs for a reader who has overridden it.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("daily-stack:theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

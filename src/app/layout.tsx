import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Daily Stack",
  description:
    "One dated edition a day of software and computer science: articles, releases, repos, discussion, papers, and a concept worth knowing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

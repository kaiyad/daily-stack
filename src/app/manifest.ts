import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Daily Stack",
    short_name: "Daily Stack",
    description: "One dated edition a day of software and computer science.",
    // Opens on today's edition, which is what an icon on a home screen is for.
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#fbfaf8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

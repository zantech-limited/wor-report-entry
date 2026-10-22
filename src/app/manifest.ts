import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zantech Service Desk",
    short_name: "Zantech",
    description: "Field work orders, customer approval and offline drafts",
    start_url: "/field",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#17395c",
    icons: [
      {
        src: "/icons/desk-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/desk-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/desk.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/desk.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

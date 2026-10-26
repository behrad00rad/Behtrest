import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = Object.fromEntries(
    ["/api", "/admin", "/static", "/media", "/ws"].map((path) => [
      path,
      {
        target: env.API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: false,
        ws: path === "/ws",
      },
    ]),
  );
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "pin-link-preview",
        apply: "serve",
        async transformIndexHtml(html, context) {
          const match = /^\/pin\/(\d+)\/?$/.exec(
            (context.originalUrl || context.path).split("?")[0],
          );
          if (!match) return html;
          try {
            const response = await fetch(
              `${env.API_PROXY_TARGET || "http://127.0.0.1:8000"}/api/pins/${match[1]}/metadata/`,
            );
            if (!response.ok) return html;
            const { data } = await response.json();
            const origin =
              context.server?.resolvedUrls?.local[0] ||
              "http://127.0.0.1:5173/";
            const image = new URL(new URL(data.image).pathname, origin).href;
            const url = new URL(`/pin/${match[1]}`, origin).href;
            return {
              html,
              tags: [
                ...Object.entries({
                  "og:type": "article",
                  "og:site_name": "Behtrest",
                  "og:title": data.title,
                  "og:description": data.description,
                  "og:image": image,
                  "og:image:alt": data.image_alt,
                  "og:url": url,
                }).map(([property, content]) => ({
                  tag: "meta",
                  attrs: { property, content: String(content) },
                  injectTo: "head" as const,
                })),
                ...Object.entries({
                  "twitter:card": "summary_large_image",
                  "twitter:title": data.title,
                  "twitter:description": data.description,
                  "twitter:image": image,
                  "twitter:image:alt": data.image_alt,
                }).map(([name, content]) => ({
                  tag: "meta",
                  attrs: { name, content: String(content) },
                  injectTo: "head" as const,
                })),
                {
                  tag: "link",
                  attrs: { rel: "canonical", href: url },
                  injectTo: "head" as const,
                },
              ],
            };
          } catch {
            return html;
          }
        },
      },
    ],
    server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
  };
});

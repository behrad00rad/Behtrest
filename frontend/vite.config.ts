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
    plugins: [react(), tailwindcss()],
    server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
  };
});

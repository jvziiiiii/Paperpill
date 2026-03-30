/* eslint-env node */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrlStr =
    env.VITE_PAPER_PILL_API_URL ||
    "https://api.deepseek.com/v1/chat/completions";

  let proxy = {};
  try {
    const u = new URL(apiUrlStr);
    const target = `${u.protocol}//${u.host}`;
    const upstreamPath = `${u.pathname}${u.search || ""}`;
    proxy["/__paperpill/openai"] = {
      target,
      changeOrigin: true,
      secure: true,
      // Must rewrite request path to the real OpenAI-compatible path on the upstream host
      rewrite: (path) =>
        path.replace(/^\/__paperpill\/openai\/?$/, upstreamPath || "/v1/chat/completions"),
    };
  } catch {
    // invalid URL — no proxy
  }

  return {
    plugins: [react()],
    server: {
      port: 3001,
      strictPort: false,
      proxy,
    },
  };
});

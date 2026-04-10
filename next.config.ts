import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  /** Hide the “N” dev menu (Route / Turbopack) in the bottom-left — dev only, no effect on production. */
  devIndicators: false,
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Cache-Control", value: "no-cache" },
      ],
    },
  ],
};

export default nextConfig;

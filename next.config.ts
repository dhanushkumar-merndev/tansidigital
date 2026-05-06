import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.9"],
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;

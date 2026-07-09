import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },
};

const withMDX = createMDX({
  // customize the config file path
  configPath: "source.config.ts"
});

export default withMDX(nextConfig);

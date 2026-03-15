import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@flowstudio/shared'],
  turbopack: {
    resolveAlias: {
      // SpacetimeDB server bindings reference this native runtime module.
      // It's only needed in the SpacetimeDB WASM runtime, not in browser/Node.
      // Stub it so Turbopack can bundle the client-side binding code.
      'spacetime:sys@2.0': './lib/stdb/spacetimedb-stub.ts',
    },
  },
};

export default nextConfig;

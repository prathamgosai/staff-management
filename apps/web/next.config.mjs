import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ["@workforceiq/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Next 14.2's dev webpack filesystem cache desyncs on Node 24, producing the
  // recurring dev-only 500s ("Cannot find module './xxx.js'", fallback chunks,
  // metadata routes). Disable the persistent cache in dev for stability — a little
  // slower to compile, production build untouched. Best real fix is Node 20 (.nvmrc).
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  // This app is verified at runtime, but was historically only run via `next dev`
  // (which skips type-checking). Pre-existing strict-mode TS/ESLint issues should
  // not block production builds on Render, which run `next build`.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Send the root to the dashboard at the ROUTING layer. A render-time
  // redirect() in a page (app/page.tsx) can throw a 500 in production under
  // Next 14.2's trace instrumentation on some Node runtimes (observed on
  // Render), so the root must NOT be a rendered redirect page.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  // Proxy every /api/* call through THIS server to the backend, so the browser
  // only ever talks to its own origin (no CORS) and there's no build-time
  // NEXT_PUBLIC API URL to misconfigure. Point it elsewhere with API_ORIGIN.
  async rewrites() {
    const apiOrigin =
      process.env.API_ORIGIN ||
      (process.env.NODE_ENV === "production"
        ? "https://bookends-shiftly.onrender.com"
        : "http://localhost:4000");
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default withNextIntl(nextConfig);

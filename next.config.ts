import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep pages in the phone's page cache so switching tabs doesn't wait on
    // the server. `static` covers the full prefetches of the tab bar's links
    // (prefetch={true}); `dynamic` covers pages reached any other way, for a
    // back-and-forth. A cached page refreshes itself in the background once
    // it is shown (components/RefreshIfStale.tsx), so instant never means stale.
    staleTimes: { dynamic: 60, static: 300 },
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or fixes to it would never reach installed phones.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

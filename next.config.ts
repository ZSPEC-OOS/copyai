import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow this app to be embedded as an iframe from any origin
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors *",
          },
          // X-Frame-Options is superseded by CSP above in modern browsers,
          // but explicitly removing SAMEORIGIN by not setting it here.
          // Some reverse proxies add it — override with a permissive value.
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

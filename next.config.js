/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      "api4ai.cloud",
      "demo.api4ai.cloud",
      "api.telegram.org",
      "static.api4.ai"
    ]
  },
  // increase body size for Vercel serverless API (note: also set per-route in api config)
  api: {
    bodyParser: {
      sizeLimit: "32mb"
    }
  },
  // recommended headers for security (optional)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer-when-downgrade" },
          { key: "Permissions-Policy", value: "camera=(), microphone=()" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
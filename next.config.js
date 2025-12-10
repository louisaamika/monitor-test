/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['api4ai.cloud', 'demo.api4ai.cloud', 'api.telegram.org']
  }
};

module.exports = nextConfig;

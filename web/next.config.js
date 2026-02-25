/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || "http://localhost:3000";

const nextConfig = {
  // Proxy API requests to the backend server
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      {
        source: "/portal/:path*",
        destination: `${API_URL}/portal/:path*`,
      },
      {
        source: "/waitlist",
        destination: `${API_URL}/waitlist`,
      },
      {
        source: "/waitlist/count",
        destination: `${API_URL}/waitlist/count`,
      },
      {
        source: "/health",
        destination: `${API_URL}/health`,
      },
    ];
  },
};

module.exports = nextConfig;

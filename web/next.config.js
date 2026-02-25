/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API requests to the backend server in development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
      {
        source: "/portal/:path*",
        destination: "http://localhost:3000/portal/:path*",
      },
      {
        source: "/waitlist",
        destination: "http://localhost:3000/waitlist",
      },
      {
        source: "/waitlist/count",
        destination: "http://localhost:3000/waitlist/count",
      },
      {
        source: "/health",
        destination: "http://localhost:3000/health",
      },
    ];
  },
};

module.exports = nextConfig;

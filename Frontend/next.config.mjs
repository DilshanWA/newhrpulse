/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const apiOrigin = process.env.HR_PULSE_API_ORIGIN;

    if (!apiOrigin) {
      if (process.env.VERCEL) {
        throw new Error("Set HR_PULSE_API_ORIGIN in Vercel to your backend HTTPS origin.");
      }
      return [];
    }

    let parsedOrigin;
    try {
      parsedOrigin = new URL(apiOrigin);
    } catch {
      throw new Error("HR_PULSE_API_ORIGIN must be an absolute backend origin.");
    }
    if (parsedOrigin.origin !== apiOrigin || (process.env.VERCEL && parsedOrigin.protocol !== "https:")) {
      throw new Error("HR_PULSE_API_ORIGIN must be an origin without a path or trailing slash (HTTPS on Vercel).");
    }
    if (process.env.VERCEL && process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL !== "/api") {
      throw new Error("Set NEXT_PUBLIC_API_URL to /api on Vercel so API requests use the same-origin proxy.");
    }

    return [
      {
        source: "/api/:path*",
        destination: `${parsedOrigin.origin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

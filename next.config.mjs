/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // يتجاهل أخطاء ESLint أثناء البناء على Vercel
    ignoreDuringBuilds: true,
  },
  typescript: {
    // يتجاهل أخطاء الـ Types الصارمة أثناء البناء
    ignoreBuildErrors: true,
  },
  images: {
    // WebP only: AVIF saves a few % more but costs far more CPU to encode on the
    // first request and to decode on low-end phones.
    formats: ['image/webp'],
    // Widths the optimiser may produce (the Photo component's `sizes` picks from
    // these). Smaller than Next's defaults at the top end: no 2048/3840 files.
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [48, 64, 96, 128, 256, 384],
    // Uploaded images have unique, immutable names — cache the variants a month.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      // Supabase Storage public bucket for product/brand imagery.
      ...(supabaseHost
        ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
        : []),
    ],
  },
  async headers() {
    // Baseline security headers. The nonce-based Content-Security-Policy is
    // set per request by middleware (lib/supabase/middleware.ts).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        // Never allow indexing of admin.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
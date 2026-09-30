import type { Metadata, Viewport } from 'next';
import { Libre_Baskerville, Reem_Kufi, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { BRAND, LOCALE, SITE_URL } from '@/config/site';

const baskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-baskerville',
  display: 'swap',
});

const reem = Reem_Kufi({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-reem',
  display: 'swap',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-ar',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description: BRAND.descriptionAr,
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    locale: 'ar_LY',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.descriptionAr,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.descriptionAr,
  },
};

export const viewport: Viewport = {
  themeColor: '#1B1714',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Root layout: fonts + metadata ONLY. Each area brings its own stylesheet —
 * the storefront `app/(store)/store.css` (approved design) and the admin
 * `app/globals.css` (Tailwind, imported in app/admin/layout.tsx). Importing
 * Tailwind here would leak its preflight/base rules into the storefront and
 * change the approved look.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={LOCALE.lang}
      dir={LOCALE.dir}
      className={`${baskerville.variable} ${reem.variable} ${plexArabic.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}

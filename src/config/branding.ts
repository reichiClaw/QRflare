/**
 * Central branding configuration.
 *
 * Change these values to rebrand the application. They are used by the UI,
 * the web app manifest, the HTTP API health endpoint and the OpenAPI document.
 * Keep this file free of runtime-specific imports so it can be shared between
 * the browser bundle, the Worker bundle and Node build scripts.
 */
export const branding = {
  /** Product name shown in the header, document title and PWA manifest. */
  name: 'FlareQR Studio',
  /** Short product name for the PWA home-screen icon. */
  shortName: 'FlareQR',
  /** One-sentence description used in meta tags and the README. */
  description:
    'Self-hosted, privacy-first QR code studio with rich styling, logo support, batch generation and an HTTP API – running on Cloudflare Workers.',
  /** Public repository URL (used for "Deploy to Cloudflare" and footer links). */
  repositoryUrl: 'https://github.com/reichiClaw/QRflare',
  /** Accent colours (hex). Also mirrored in src/app/styles/theme.css. */
  colors: {
    primary: '#2563EB',
    accent: '#14B8A6',
    dark: '#0B1220',
    light: '#F8FAFC',
  },
  /** Path of the vector logo served from the assets directory. */
  logoPath: '/icons/icon.svg',
  /** Shown in the footer. */
  tagline: 'Generated locally in your browser. Nothing is uploaded.',
} as const;

export type Branding = typeof branding;

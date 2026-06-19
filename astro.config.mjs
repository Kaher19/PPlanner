import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: 'server',
  adapter: vercel(),
  // Security headers are set in vercel.json for Vercel deployments.
  // For local dev, they are injected via src/middleware.ts.
  vite: {
    define: {
      // Expose NODE_ENV to the client build for conditional logic
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
  },
});

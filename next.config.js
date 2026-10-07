/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  webpack: (config) => {
    // pdf.js tenta carregar "canvas" (só existe em Node); no navegador não é usado
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;

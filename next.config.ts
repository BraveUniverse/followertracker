import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: [
      // LUKSO IPFS ağ geçitleri
      'api.universalprofile.cloud',
      '2eff.lukso.dev',
      'ipfs.lukso.network',
      'cloudflare-ipfs.com',
      'ipfs.io',
      // Diğer olası görüntü kaynakları
      'lukso.network',
      'assets.lukso.network',
      'storage.googleapis.com'
    ],
    formats: ['image/avif', 'image/webp'],
    // 1 MB maksimum görüntü boyutu
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Geliştirme sırasında hızlı yeniden yüklemeyi etkinleştir
  reactStrictMode: true,
  // Deneysel modern IPFS görüntü optimizasyonu
  experimental: {
    // IPFS görüntülerinin daha hızlı yüklenmesi için
    scrollRestoration: true,
  }
};

export default nextConfig;

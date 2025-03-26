import TerserPlugin from 'terser-webpack-plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Statik site çıktısı için gerekli
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
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
    unoptimized: true,  // Statik export için gerekli
  },
  // Alt dizin için basePath ve assetPrefix ayarları
  basePath: '/miniapps/followertracker',
  assetPrefix: '/miniapps/followertracker/',
  trailingSlash: true,
  // Geliştirme sırasında hızlı yeniden yüklemeyi etkinleştir
  reactStrictMode: true,
  // Deneysel modern IPFS görüntü optimizasyonu
  experimental: {
    // IPFS görüntülerinin daha hızlı yüklenmesi için
    scrollRestoration: true,
    // Font hatalarını tolere et
    fontLoaders: [
      { loader: '@next/font/google', options: { subsets: ['latin'] } },
    ],
  },
  // Production build'de console.log'ları kaldır
  compiler: {
    removeConsole: {
      exclude: ['error', 'warn'], // error ve warn loglarını tut
    },
  },
  // Webpack optimizasyonları
  webpack: (config, { dev, isServer }) => {
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
        minimizer: [
          ...config.optimization.minimizer || [],
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true, // console.* ifadelerini kaldır
                pure_funcs: ['console.log'], // console.log'ları özellikle kaldır
              },
            },
          }),
        ],
      };
    }
    return config;
  },
};

export default nextConfig; 
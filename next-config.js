/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  webpack: (config, { isServer }) => {
    // Filter out TypeScript extensions
    config.resolve.extensions = config.resolve.extensions.filter(ext => ext !== '.ts' && ext !== '.tsx');
    
    // Add FFmpeg.wasm fallbacks
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      os: false,
      perf_hooks: false
    };
    
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/shrinked-vs-circleback',
        destination: 'https://pdf.shrinked.ai/shrinked-vs-circleback/',
      },
    ];
  },
};

module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // This will completely disable TypeScript during build
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // This will make Next.js ignore TypeScript files
    config.resolve.extensions = config.resolve.extensions.filter(ext => ext !== '.ts' && ext !== '.tsx')
    return config
  },
}

module.exports = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  reactStrictMode: true,
}

module.exports = {
  async rewrites() {
    return [
      {
        source: '/shrinked-vs-circleback',
        destination: 'https://pdf.shrinked.ai/shrinked-vs-circleback/',
      },
    ];
  },
};
/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverComponentsExternalPackages: [
      'pdf-parse',
      'mammoth',
      '@xenova/transformers',
      'onnxruntime-node',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from trying to bundle native .node binaries
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        ({ request }, callback) => {
          if (request && request.endsWith('.node')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    } else {
      // On the client side, stub out server-only packages entirely
      config.resolve.alias = {
        ...config.resolve.alias,
        '@xenova/transformers': false,
        'onnxruntime-node': false,
      };
    }
    return config;
  },
};

module.exports = config;

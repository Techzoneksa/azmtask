/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /*
   * Linting is a development gate, not a deployment gate. The lint toolchain stays in
   * devDependencies, which production installs skip — so a host running
   * `npm ci --omit=dev` would otherwise fail the build with "ESLint must be installed".
   * `npm run verify` runs typecheck, lint and build together before every push.
   */
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

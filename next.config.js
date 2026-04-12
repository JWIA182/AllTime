/** @type {import('next').NextConfig} */
// On GitHub Pages, a project repo (e.g. github.com/<you>/AllTime) is served
// from `<you>.github.io/AllTime/`, so Next needs `basePath: '/AllTime'`. A user
// site (`<you>.github.io`) doesn't need it. Set BASE_PATH at build time to
// switch between them. The deploy workflow sets it via repo secrets/vars.
const basePath = process.env.BASE_PATH || "";

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",
  distDir: isProd ? "_static" : ".next",
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
};

module.exports = nextConfig;

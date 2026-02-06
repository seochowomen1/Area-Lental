/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // Windows 환경(특히 OneDrive/동기화 폴더)에서 .next/cache rename ENOENT가 간헐적으로 발생할 수 있어
    // 개발 모드에서는 파일 시스템 캐시 대신 메모리 캐시를 사용합니다.
    if (dev && process.platform === "win32") {
      config.cache = { type: "memory" };
    }
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
  },
  // build 단계에서 next가 내부적으로 lint를 다시 실행하지 않도록 끄고,
  // 대신 npm scripts에서 eslint를 직접 실행하도록 구성합니다.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

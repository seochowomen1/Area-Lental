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
};

module.exports = nextConfig;

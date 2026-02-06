#!/usr/bin/env node
/*
  환경 점검 스크립트

  Next.js(SWC)에서 자주 발생하는 오류:
  - "...next-swc.win32-x64-msvc.node is not a valid Win32 application"

  대표 원인
  1) Windows에서 32-bit Node(ia32)를 사용 중인데 x64 SWC 바이너리를 로딩하려는 경우
  2) Windows ARM(arm64) 환경에서 x64 Node/패키지 혼용
  3) node_modules 설치가 중간에 끊겨 바이너리(.node)가 손상된 경우

  이 스크립트는 1)~2)를 사전에 감지해, 설치 단계에서 명확한 안내를 출력합니다.
*/

function fail(message) {
  console.error("\n[환경 점검 실패]\n" + message + "\n");
  process.exit(1);
}

function parseMajor(version) {
  const m = String(version || "").match(/^(\d+)\./);
  return m ? Number(m[1]) : 0;
}

const platform = process.platform; // win32, darwin, linux
const arch = process.arch; // x64, ia32, arm64 ...
const nodeVersion = process.versions.node;
const major = parseMajor(nodeVersion);

// Next 14는 최소 Node 18.17+ 권장(일반적으로 18/20 LTS 권장)
if (major < 18) {
  fail(
    `Node.js 버전이 너무 낮습니다: ${nodeVersion}\n` +
      `- 권장: Node 20 LTS 또는 Node 18.17+\n` +
      `- 조치: Node.js를 업그레이드 후 다시 설치하세요.`
  );
}

if (platform === "win32") {
  if (arch === "ia32") {
    fail(
      `현재 Node 아키텍처가 ia32(32-bit)로 감지되었습니다.\n` +
        `이 프로젝트(Next.js)는 Windows에서 x64 SWC 바이너리를 사용하므로,\n` +
        `32-bit Node에서는 "not a valid Win32 application" 오류가 발생합니다.\n\n` +
        `- 조치 1) 64-bit Node.js(x64)로 재설치\n` +
        `- 조치 2) 설치 후 확인: node -p "process.arch"  (x64가 나와야 정상)\n` +
        `- 그 다음: node_modules 삭제 후 npm ci(또는 npm install)로 재설치`
    );
  }

  // Windows ARM(arm64)에서 x64/arm64 혼용 이슈 안내
  // (arm64 Node라면 arch=arm64, x64 Node라면 arch=x64)
  // 어떤 쪽이든 일관성 있게 설치하도록 안내만 출력
  if (arch === "arm64") {
    console.warn(
      "\n[환경 안내] Windows ARM(arm64)로 감지되었습니다.\n" +
        "- Node.js(arm64)와 의존성(@next/swc-win32-arm64-msvc)이 일관되게 설치되어야 합니다.\n" +
        "- 만약 x64 패키지가 설치되면 SWC 로딩 오류가 날 수 있습니다.\n" +
        "- 문제 발생 시: node_modules 삭제 후 npm cache clean --force && npm ci 를 권장합니다.\n"
    );
  }
}

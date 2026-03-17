import { validateFileMagicBytes } from "@/lib/config";

function makeBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("validateFileMagicBytes", () => {
  it("PDF 매직 바이트 인식", () => {
    // %PDF
    const buf = makeBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe("application/pdf");
  });

  it("PNG 매직 바이트 인식", () => {
    const buf = makeBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe("image/png");
  });

  it("JPEG 매직 바이트 인식", () => {
    const buf = makeBuffer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe("image/jpeg");
  });

  it("알 수 없는 형식 거부", () => {
    const buf = makeBuffer([0x00, 0x00, 0x00, 0x00]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(false);
    expect(result.detectedType).toBe("unknown");
  });

  it("빈 버퍼 거부", () => {
    const buf = makeBuffer([]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(false);
  });

  it("EXE 파일 거부 (MZ 헤더)", () => {
    const buf = makeBuffer([0x4d, 0x5a, 0x90, 0x00]);
    const result = validateFileMagicBytes(buf);
    expect(result.ok).toBe(false);
  });
});

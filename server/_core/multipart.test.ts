import { describe, expect, it } from "vitest";
import { detectFileType } from "./multipart";

describe("detecção segura de uploads", () => {
  it("detecta arquivos pela assinatura e não pela extensão", () => {
    expect(detectFileType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      "png"
    );
    expect(detectFileType(Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("docx");
    expect(
      detectFileType(Buffer.from("<script>alert(1)</script>"))
    ).toBeUndefined();
  });
});

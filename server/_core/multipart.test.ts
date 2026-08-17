import { Readable } from "node:stream";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { detectFileType, parseMultipartFiles } from "./multipart";

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

  it("aceita um arquivo acompanhado de campo textual sem estourar o limite de partes", async () => {
    const boundary = "qa-boundary";
    const body = Buffer.from([
      `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\n\r\nplanner\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="plano.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      "%PDF-1.7 teste\r\n",
      `--${boundary}--\r\n`,
    ].join(""));
    const request = Readable.from(body) as unknown as Request;
    request.headers = {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    };

    const files = await parseMultipartFiles(request, {
      kind: "document",
      maxFiles: 1,
      maxFileBytes: 1024,
      maxTotalBytes: 2048,
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ filename: "plano.pdf", extension: "pdf" });
  });
});

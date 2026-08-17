import Busboy from "busboy";
import type { Request } from "express";
import JSZip from "jszip";

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  filename: string;
  extension: "png" | "jpg" | "webp" | "pdf" | "docx";
};

export type MultipartPolicy = {
  kind: "image" | "document";
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
};

export class MultipartValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export function detectFileType(
  buffer: Buffer
): UploadedFile["extension"] | undefined {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return "jpg";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-")
    return "pdf";
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2]) &&
    [0x04, 0x06, 0x08].includes(buffer[3])
  )
    return "docx";
  return undefined;
}

function trustedMimeType(extension: UploadedFile["extension"]): string {
  return {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }[extension];
}

function allowed(
  extension: UploadedFile["extension"],
  kind: MultipartPolicy["kind"]
): boolean {
  return kind === "image"
    ? ["png", "jpg", "webp"].includes(extension)
    : ["pdf", "docx"].includes(extension);
}

async function assertSafeDocx(buffer: Buffer): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new MultipartValidationError("O arquivo DOCX está corrompido ou não é um ZIP válido.");
  }
  const entries = Object.values(zip.files);
  const uncompressedBytes = entries.reduce((total, entry) => {
    const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    return total + (Number.isFinite(size) ? size : 0);
  }, 0);
  if (
    entries.length > 2_000 ||
    uncompressedBytes > 50 * 1024 * 1024 ||
    !zip.file("[Content_Types].xml") ||
    !zip.file("word/document.xml")
  ) {
    throw new MultipartValidationError("O arquivo não possui uma estrutura DOCX segura.");
  }
}

export async function parseMultipartFiles(
  req: Request,
  policy: MultipartPolicy
): Promise<UploadedFile[]> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new MultipartValidationError(
      "Envie os arquivos como multipart/form-data."
    );
  }
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > policy.maxTotalBytes + 64 * 1024
  ) {
    throw new MultipartValidationError(
      "O upload excede o limite total permitido.",
      413
    );
  }

  return new Promise((resolve, reject) => {
    const files: UploadedFile[] = [];
    const pending: Promise<void>[] = [];
    let totalBytes = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: policy.maxFiles,
          fileSize: policy.maxFileBytes,
          // Browsers and proxies may add harmless textual multipart parts.
          // Files remain constrained independently; extra fields are ignored.
          fields: 4,
          parts: policy.maxFiles + 4,
        },
      });
    } catch {
      throw new MultipartValidationError("Cabeçalho multipart inválido.");
    }

    parser.on("file", (_field, stream, info) => {
      pending.push(
        new Promise<void>((done, fileReject) => {
          const chunks: Buffer[] = [];
          let fileBytes = 0;
          let limited = false;
          stream.on("limit", () => {
            limited = true;
          });
          stream.on("data", (chunk: Buffer) => {
            fileBytes += chunk.length;
            totalBytes += chunk.length;
            if (totalBytes > policy.maxTotalBytes) {
              stream.resume();
              fileReject(
                new MultipartValidationError(
                  "O upload excede o limite total permitido.",
                  413
                )
              );
              return;
            }
            chunks.push(chunk);
          });
          stream.on("error", fileReject);
        stream.on("end", async () => {
            if (limited) {
              fileReject(
                new MultipartValidationError(
                  `O arquivo '${info.filename}' excede o limite permitido.`,
                  413
                )
              );
              return;
            }
            const buffer = Buffer.concat(chunks, fileBytes);
            const extension = detectFileType(buffer);
          if (!extension || !allowed(extension, policy.kind)) {
              fileReject(
                new MultipartValidationError(
                  `O arquivo '${info.filename}' possui conteúdo não permitido.`
                )
              );
            return;
          }
          if (extension === "docx") {
            try {
              await assertSafeDocx(buffer);
            } catch (error) {
              fileReject(error);
              return;
            }
          }
            files.push({
              buffer,
              filename: info.filename.slice(0, 255),
              mimetype: trustedMimeType(extension),
              extension,
            });
            done();
          });
        })
      );
    });
    parser.on("filesLimit", () =>
      fail(
        new MultipartValidationError(
          "Quantidade máxima de arquivos excedida.",
          413
        )
      )
    );
    parser.on("partsLimit", () =>
      fail(
        new MultipartValidationError(
          "Quantidade máxima de partes excedida.",
          413
        )
      )
    );
    parser.on("error", fail);
    parser.on("finish", async () => {
      if (settled) return;
      try {
        await Promise.all(pending);
        settled = true;
        resolve(files);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new MultipartValidationError("Falha ao processar upload.")
        );
      }
    });
    req.on("aborted", () =>
      fail(new MultipartValidationError("Upload interrompido pelo cliente."))
    );
    req.pipe(parser);
  });
}

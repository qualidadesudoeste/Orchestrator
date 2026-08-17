import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSyntheticUploadFixture, selectSyntheticFixtureKind } from "./testFixtureService";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("testFixtureService", () => {
  it("escolhe uma fixture compatível com o accept do campo", () => {
    expect(selectSyntheticFixtureKind(".jpg,.jpeg,.png")).toBe("PNG");
    expect(selectSyntheticFixtureKind("image/*")).toBe("PNG");
    expect(selectSyntheticFixtureKind("application/pdf")).toBe("PDF");
    expect(selectSyntheticFixtureKind("application/pdf", "PNG")).toBe("PDF");
  });

  it("gera um PNG sintético dentro do diretório isolado da execução", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "orchestrator-fixture-"));
    temporaryDirectories.push(directory);
    const fixture = await createSyntheticUploadFixture(directory, "run/fora", "DEN-002", "PNG");
    const bytes = await readFile(fixture.filepath);
    expect(path.dirname(fixture.filepath)).toBe(path.resolve(directory, "fixtures"));
    expect(fixture.filename).toMatch(/^qa-run-fora-den-002\.png$/);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(fixture.bytes).toBe(bytes.length);
  });
});

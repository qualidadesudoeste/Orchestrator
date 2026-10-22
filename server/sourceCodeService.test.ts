import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexProjectSource } from "./sourceCodeService";

describe("indexProjectSource", () => {
  it("extrai rotas, campos e seletores sem ler segredos ou node_modules", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orchestrator-source-"));
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "node_modules"));
    await writeFile(path.join(root, "src", "Login.tsx"), `
      export const route = "/login";
      <input name="username" placeholder="E-mail" data-testid="login-user" />;
    `);
    await writeFile(path.join(root, ".env"), "OPENAI_API_KEY=nao-pode-aparecer");
    await writeFile(path.join(root, "node_modules", "ignored.js"), "const route='/segredo'");

    const result = await indexProjectSource(root);

    expect(result.summary).toContain("/login");
    expect(result.summary).toContain("login-user");
    expect(result.summary).toContain("username");
    expect(result.summary).not.toContain("nao-pode-aparecer");
    expect(result.summary).not.toContain("/segredo");
    expect(result.fileCount).toBe(1);
  });

  it("rejeita uma pasta inexistente", async () => {
    await expect(indexProjectSource(path.join(tmpdir(), "pasta-que-nao-existe-qa")))
      .rejects.toThrow("não existe");
  });
});

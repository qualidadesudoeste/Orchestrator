import { describe, expect, it } from "vitest";
import {
  extractRegressionFiles,
  RegressionValidationError,
} from "./regressionCodeRoutes";

const validCode = `
import { test, expect } from "@playwright/test";

test("abre informações", async ({ page }) => {
  await page.goto(process.env.BASE_URL ?? "https://example.com");
  await page.getByRole("link", { name: "More information" }).click();
  await expect(page).toHaveURL(/iana/);
});
`;

describe("extractRegressionFiles", () => {
  it("extrai e limpa código gerado por cenário", () => {
    const files = extractRegressionFiles({
      resultados: [
        {
          scenario_id: "CT-001",
          scenario_title: "Abrir informações",
          resultado_teste: {
            codigo_regressao: `\`\`\`typescript\n${validCode}\n\`\`\``,
          },
        },
      ],
    });

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("ct-001.spec.ts");
    expect(files[0].content).toContain("@playwright/test");
    expect(files[0].content).not.toContain("```");
  });

  it("rejeita seletores não semânticos", () => {
    expect(() =>
      extractRegressionFiles({
        files: [
          {
            filename: "login.spec.ts",
            content: validCode.replace(
              'page.getByRole("link", { name: "More information" })',
              'page.locator("#login")',
            ),
          },
        ],
      }),
    ).toThrowError(RegressionValidationError);
  });

  it("rejeita payload sem código", () => {
    expect(() => extractRegressionFiles({ resultados: [] })).toThrow(
      "Nenhum código de regressão",
    );
  });
});

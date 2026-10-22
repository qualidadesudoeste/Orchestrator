import { describe, it, expect } from "vitest";
import { invokeLLM } from "./_core/llm";

describe("qaPlanner - LLM provider validation", () => {
  it.runIf(Boolean(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.BUILT_IN_FORGE_API_KEY))(
    "deve conseguir chamar a OpenAI configurada",
    async () => {
      const result = await invokeLLM({
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        maxTokens: 256,
      });
      expect(result).toBeDefined();
      expect(result.choices).toBeDefined();
      expect(result.choices.length).toBeGreaterThan(0);
      const content = result.choices[0]?.message?.content;
      expect(typeof content === "string" ? content.length : 0).toBeGreaterThan(0);
    },
    180_000
  );
});

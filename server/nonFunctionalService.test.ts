import { describe, expect, it } from "vitest";
import {
  NonFunctionalValidationError,
  normalizeNonFunctionalPayload,
} from "./nonFunctionalService";

describe("normalizeNonFunctionalPayload", () => {
  it("consolida as três ferramentas e deriva falha geral", () => {
    const result = normalizeNonFunctionalPayload({
      run_id: "nf-001",
      projeto: "Orchestrator",
      sprint: "Sprint 7",
      target_url: "https://example.com",
      k6: {
        status: "PASSOU",
        metrics: {
          p95_ms: 420,
          http_req_failed_rate: 0.0125,
          total_requests: 250,
        },
        findings: [],
      },
      zap: {
        status: "FALHOU",
        alerts: { high: 1, medium: 2, low: 3 },
        findings: [
          {
            risk: "High",
            plugin_id: "10001",
            alert: "Cabeçalho ausente",
            reference: "<p>https://example.com/ajuda</p>",
          },
        ],
      },
      axe: {
        status: "PASSOU",
        violations: { critical: 0, serious: 0, moderate: 1, minor: 0 },
        findings: [],
      },
    });

    expect(result.status).toBe("FALHOU");
    expect(result.k6FailureRateBasisPoints).toBe(125);
    expect(result.zapHigh).toBe(1);
    expect(result.findings[0]).toMatchObject({
      tool: "ZAP",
      severity: "ALTO",
      ruleId: "10001",
      helpUrl: "https://example.com/ajuda",
    });
  });

  it("classifica como parcial quando uma ferramenta não executa", () => {
    const result = normalizeNonFunctionalPayload({
      run_id: "nf-002",
      target_url: "https://example.com",
      k6: { status: "PASSOU" },
      zap: { status: "NAO_EXECUTADO" },
      axe: { status: "PASSOU" },
    });
    expect(result.status).toBe("PARCIAL");
  });

  it("exige identificador idempotente e URL HTTP", () => {
    expect(() =>
      normalizeNonFunctionalPayload({ target_url: "file:///tmp/teste" }),
    ).toThrow(NonFunctionalValidationError);
  });
});

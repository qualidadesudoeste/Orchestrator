import { describe, expect, it } from "vitest";
import { queuePoolForProvider, workerCanRunPool } from "./executionQueueService";

describe("execution queue routing", () => {
  it("routes environments without VPN to the public pool", () => {
    expect(queuePoolForProvider("NONE")).toBe("PUBLIC");
    expect(queuePoolForProvider(undefined)).toBe("PUBLIC");
  });

  it("keeps FortiClient providers in isolated pools", () => {
    expect(queuePoolForProvider("COGEL")).toBe("COGEL");
    expect(queuePoolForProvider("SEFAZ")).toBe("SEFAZ");
  });

  it("allows parallel jobs only in the same active network on a local worker", () => {
    expect(workerCanRunPool("ANY", "COGEL", "COGEL")).toBe(true);
    expect(workerCanRunPool("ANY", "COGEL", "SEFAZ")).toBe(false);
    expect(workerCanRunPool("ANY", "COGEL", "PUBLIC")).toBe(false);
  });

  it("respects a dedicated worker pool", () => {
    expect(workerCanRunPool("SEFAZ", null, "SEFAZ")).toBe(true);
    expect(workerCanRunPool("SEFAZ", null, "COGEL")).toBe(false);
  });
});

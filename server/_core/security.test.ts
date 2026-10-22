import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { isAllowedRequestOrigin } from "./security";

function request(origin: string | undefined, host = "localhost:3000"): Request {
  return {
    protocol: "http",
    get(name: string) {
      if (name.toLowerCase() === "origin") return origin;
      if (name.toLowerCase() === "host") return host;
      return undefined;
    },
  } as Request;
}

describe("isAllowedRequestOrigin", () => {
  it("aceita clientes sem Origin, como workers e webhooks", () => {
    expect(isAllowedRequestOrigin(request(undefined))).toBe(true);
  });

  it("aceita a mesma origem da requisiÃ§Ã£o", () => {
    expect(isAllowedRequestOrigin(request("http://localhost:3000"))).toBe(true);
  });

  it("rejeita origem cruzada", () => {
    expect(isAllowedRequestOrigin(request("https://attacker.example"))).toBe(
      false
    );
  });
});

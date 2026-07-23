import crypto from "node:crypto";
import type { Express, Request } from "express";
import { ENV } from "./_core/env";
import {
  getDefectCardByExternalId,
  replaceDefectCards,
} from "./db";
import {
  DefectCardValidationError,
  generateDefectCards,
  getDefectExecutionId,
} from "./defectCardService";

const DOWNLOAD_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const SAFE_CARD_ID = /^BUG-[A-F0-9]{20}$/;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function bearerToken(req: Request): string {
  const authorization = req.headers.authorization ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function signature(cardId: string, expires: number): string {
  return crypto
    .createHmac("sha256", ENV.qaAgentApiToken)
    .update(`defect-card/${cardId}:${expires}`)
    .digest("hex");
}

function downloadUrl(req: Request, cardId: string, expires: number): string {
  const baseUrl =
    ENV.orchestratorPublicUrl.replace(/\/+$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  const url = new URL(`/api/qa/defect-cards/${cardId}.md`, baseUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(cardId, expires));
  return url.toString();
}

export function registerDefectCardRoutes(app: Express): void {
  app.post("/api/qa/defect-cards", async (req, res) => {
    try {
      if (!ENV.qaAgentApiToken) {
        res.status(503).json({
          error:
            "Integração não configurada. Defina QA_AGENT_API_TOKEN no Orchestrator.",
        });
        return;
      }
      const token = bearerToken(req);
      if (!token || !safeEqual(token, ENV.qaAgentApiToken)) {
        res.status(401).json({ error: "Token do agente inválido." });
        return;
      }

      const raw = req.body?.json ?? req.body;
      const externalExecutionId = getDefectExecutionId(raw);
      const cards = generateDefectCards(raw);
      const savedCards = await replaceDefectCards(externalExecutionId, cards);
      const idByExternalCard = new Map(
        savedCards.map(card => [card.externalCardId, card.id]),
      );
      const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_LIFETIME_SECONDS;

      res.status(200).json({
        ...raw,
        defect_cards: {
          execution_id: externalExecutionId,
          generated_at: new Date().toISOString(),
          expires_at: new Date(expires * 1000).toISOString(),
          total: cards.length,
          files: cards.map(card => ({
            id: idByExternalCard.get(card.externalCardId),
            card_id: card.externalCardId,
            scenario_id: card.externalScenarioId,
            title: card.title,
            severity: card.severity,
            filename: `${card.externalCardId}.md`,
            markdown: card.markdown,
            download_url: downloadUrl(req, card.externalCardId, expires),
          })),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida.";
      if (error instanceof DefectCardValidationError) {
        res.status(400).json({ error: message });
        return;
      }
      if (message === "DB unavailable") {
        res.status(503).json({
          error:
            "Banco de dados indisponível. Configure DATABASE_URL e aplique as migrations.",
        });
        return;
      }
      console.error("[qa-defect-cards] error:", error);
      res.status(500).json({
        error: `Falha ao gerar cards de defeito: ${message}`,
      });
    }
  });

  app.get("/api/qa/defect-cards/:cardId.md", async (req, res) => {
    const cardId = String(req.params.cardId ?? "").toUpperCase();
    const expires = Number(req.query.expires);
    const receivedSignature = String(req.query.signature ?? "");
    if (
      !ENV.qaAgentApiToken ||
      !SAFE_CARD_ID.test(cardId) ||
      !Number.isInteger(expires) ||
      expires < Math.floor(Date.now() / 1000) ||
      !receivedSignature ||
      !safeEqual(receivedSignature, signature(cardId, expires))
    ) {
      res.status(403).json({ error: "Link inválido ou expirado." });
      return;
    }

    try {
      const card = await getDefectCardByExternalId(cardId);
      if (!card) {
        res.status(404).json({ error: "Card não encontrado." });
        return;
      }
      res
        .status(200)
        .type("text/markdown; charset=utf-8")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="${card.externalCardId}.md"`,
        )
        .send(card.markdown);
    } catch (error) {
      console.error("[qa-defect-card-download] error:", error);
      res.status(500).json({ error: "Falha ao baixar card." });
    }
  });
}

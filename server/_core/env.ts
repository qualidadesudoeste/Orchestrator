export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  credentialEncryptionKey:
    process.env.CREDENTIAL_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === "production"
      ? ""
      : (process.env.JWT_SECRET ?? "")),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  llmApiUrl:
    process.env.LLM_API_URL ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
  llmApiKey:
    process.env.OPENAI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.LLM_API_KEY ??
    process.env.BUILT_IN_FORGE_API_KEY ??
    "",
  llmModel: process.env.LLM_MODEL ?? "gpt-5-mini",
  llmFallbackApiUrl: process.env.LLM_FALLBACK_API_URL ?? "",
  llmFallbackApiKey: process.env.LLM_FALLBACK_API_KEY ?? "",
  llmFallbackModel: process.env.LLM_FALLBACK_MODEL ?? "",
  qaAgentApiToken: process.env.QA_AGENT_API_TOKEN ?? "",
  orchestratorPublicUrl: process.env.ORCHESTRATOR_PUBLIC_URL ?? "",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  trustProxy: process.env.TRUST_PROXY,
  shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "10mb",
  allowManualTestUrls: process.env.ALLOW_MANUAL_TEST_URLS === "true",
};

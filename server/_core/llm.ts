import { ENV } from "./env";
import { getActiveAiProviderSetting } from "../db";
import { decryptCredential } from "../credentialCrypto";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

type LlmProviderConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

const isLocalLlmUrl = (value: string): boolean => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
};

const resolveProviderPath = (
  resource: "chat/completions" | "models",
  apiUrl = ENV.llmApiUrl,
) => {
  const baseUrl = apiUrl.replace(/\/$/, "");
  if (/generativelanguage\.googleapis\.com/i.test(baseUrl)) {
    return `${baseUrl}/${resource}`;
  }
  return `${baseUrl}/v1/${resource}`;
};

const resolveApiUrl = (apiUrl = ENV.llmApiUrl) =>
  apiUrl && apiUrl.trim().length > 0
    ? resolveProviderPath("chat/completions", apiUrl)
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = (apiUrl = ENV.llmApiUrl, apiKey = ENV.llmApiKey) => {
  if (!apiKey && !isLocalLlmUrl(apiUrl)) {
    throw new Error("LLM_API_KEY is not configured");
  }
};

const environmentPrimaryProvider = (): LlmProviderConfig => ({
  apiUrl: ENV.llmApiUrl,
  // Never forward a cloud key to a process listening on this computer.
  apiKey: isLocalLlmUrl(ENV.llmApiUrl) ? "" : ENV.llmApiKey,
  model: ENV.llmModel,
});

const primaryProvider = async (): Promise<LlmProviderConfig> => {
  try {
    const setting = await getActiveAiProviderSetting();
    if (setting) {
      return {
        apiUrl: setting.apiUrl,
        apiKey: setting.apiKeyEncrypted ? decryptCredential(setting.apiKeyEncrypted) : "",
        model: setting.model,
      };
    }
  } catch (error) {
    console.warn("[LLM] Não foi possível ler o provedor global; usando o .env.", error);
  }
  return environmentPrimaryProvider();
};

const fallbackProvider = (): LlmProviderConfig | undefined => {
  if (!ENV.llmFallbackApiUrl || !ENV.llmFallbackModel) return undefined;
  return {
    apiUrl: ENV.llmFallbackApiUrl,
    apiKey: ENV.llmFallbackApiKey,
    model: ENV.llmFallbackModel,
  };
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

const isRetryableStatus = (status: number): boolean =>
  status === 408 ||
  status === 409 ||
  status === 425 ||
  status === 429 ||
  status >= 500;

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum
// delay so a misbehaving caller loop slows down instead of hammering the
// upstream while it keeps returning errors.
const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

// Retries transient HTTP responses and network errors with exponential
// backoff. Invalid requests and authentication errors return immediately so
// the caller can show the real problem without unnecessary waiting.
const fetchWithBackoff = async (
  url: string,
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (
        response.ok ||
        !isRetryableStatus(response.status) ||
        attempt === RETRY_MAX_RETRIES
      ) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

async function invokeProvider(
  params: InvokeParams,
  provider: LlmProviderConfig,
): Promise<InvokeResult> {
  assertApiKey(provider.apiUrl, provider.apiKey);

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
  } = params;

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  const resolvedModel = model || provider.model;
  if (resolvedModel) {
    payload.model = resolvedModel;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    // GPT-5 and reasoning models reject the legacy max_tokens parameter.
    // Keep it for older chat models and Forge-compatible providers.
    const usesCompletionTokenLimit =
      typeof resolvedModel === "string" &&
      (/^gpt-5(?:[.-]|$)/i.test(resolvedModel) ||
        /^o\d(?:[.-]|$)/i.test(resolvedModel));
    payload[
      usesCompletionTokenLimit ? "max_completion_tokens" : "max_tokens"
    ] = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    // Groq supports JSON Object Mode across all current chat models. This
    // keeps the provider swap reliable even when the selected model does not
    // implement JSON Schema constrained decoding.
    const usesGroqJsonObject =
      /api\.groq\.com/i.test(provider.apiUrl) &&
      normalizedResponseFormat.type === "json_schema";
    payload.response_format = usesGroqJsonObject
      ? { type: "json_object" }
      : normalizedResponseFormat;

    if (usesGroqJsonObject) {
      payload.messages = [
        {
          role: "system",
          content: [
            "Retorne exclusivamente um objeto JSON válido, sem Markdown.",
            "O objeto deve respeitar exatamente o JSON Schema abaixo, incluindo os nomes das propriedades:",
            JSON.stringify(normalizedResponseFormat.json_schema.schema),
          ].join("\n"),
        },
        ...(payload.messages as ReturnType<typeof normalizeMessage>[]),
      ];
    }
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  const response = await fetchWithBackoff(resolveApiUrl(provider.apiUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: isLocalLlmUrl(provider.apiUrl)
      ? AbortSignal.timeout(180_000)
      : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  try {
    return await invokeProvider(params, await primaryProvider());
  } catch (primaryError) {
    const fallback = fallbackProvider();
    if (!fallback) throw primaryError;
    console.warn("LLM local indisponível; tentando o provedor de fallback configurado.");
    return invokeProvider({ ...params, model: fallback.model }, fallback);
  }
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

async function listModelsForProvider(provider: LlmProviderConfig): Promise<ModelsResponse> {
  assertApiKey(provider.apiUrl, provider.apiKey);
  const url = provider.apiUrl && provider.apiUrl.trim().length > 0
    ? resolveProviderPath("models", provider.apiUrl)
    : "https://forge.manus.im/v1/models";
  const headers: Record<string, string> = {};
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
  const response = await fetchWithBackoff(url, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`);
  }
  return (await response.json()) as ModelsResponse;
}

export async function testLLMProviderConfig(provider: LlmProviderConfig): Promise<{ ok: true; modelCount: number }> {
  const models = await listModelsForProvider(provider);
  return { ok: true, modelCount: Array.isArray(models.data) ? models.data.length : 0 };
}

export async function listLLMModels(): Promise<ModelsResponse> {
  return listModelsForProvider(await primaryProvider());
}

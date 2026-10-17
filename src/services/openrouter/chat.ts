import { z } from 'zod';

import { parseTolerantJson } from '@/core/llm/json';

import { PipelineFailure, pipelineFailure } from './errors';
import { supportsStructuredOutput } from './models';
import { CALL_TIMEOUTS_MS, jsonBody } from './transport';

import type { ModelCatalog } from './models';
import type { Transport } from './transport';
import type { ZodType } from 'zod';

export interface CacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  /** Provider-reported cost in USD, or null when the response carried none. */
  costUsd: number | null;
}

export interface ChatDeps {
  transport: Transport;
  models: ModelCatalog;
}

const annotationSchema = z.object({
  type: z.string(),
  file: z
    .object({
      hash: z.string().nullish(),
      content: z.array(z.object({ type: z.string(), text: z.string().nullish() })).nullish(),
    })
    .nullish(),
});

export type ChatAnnotation = z.infer<typeof annotationSchema>;

const completionSchema = z.object({
  id: z.string().nullish(),
  model: z.string().nullish(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          annotations: z.array(annotationSchema).nullish(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      cost: z.number().nullish(),
    })
    .nullish(),
});

export interface ChatCompletion {
  content: string;
  annotations: ChatAnnotation[];
  usage: ChatUsage;
  generationId: string | null;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

type ContentPart =
  | { type: 'text'; text: string; cache_control?: CacheControl }
  | { type: 'file'; file: { filename: string; file_data: string } };

interface ResponseFormat {
  type: 'json_schema';
  json_schema: { name: string; strict: true; schema: Record<string, unknown> };
}

interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  response_format?: ResponseFormat;
  provider?: { require_parameters: true };
  plugins?: { id: 'file-parser'; pdf: { engine: string } }[];
  temperature?: number;
  seed?: number;
  max_tokens?: number;
  usage: { include: true };
}

/** Posts one chat/completions request and reads the reply, its usage and its generation id. */
export async function sendChatCompletion(
  deps: ChatDeps,
  body: ChatRequestBody,
  signal?: AbortSignal,
): Promise<ChatCompletion> {
  return deps.transport.request(
    {
      method: 'POST',
      path: '/chat/completions',
      body,
      accept: 'application/json',
      signal,
      timeoutMs: CALL_TIMEOUTS_MS.chat,
    },
    async (res) => {
      const parsed = await jsonBody(completionSchema)(res);
      const choice = parsed.choices[0];
      return {
        content: choice?.message.content ?? '',
        annotations: choice?.message.annotations ?? [],
        usage: toUsage(parsed.usage),
        generationId: res.headers.get('x-generation-id') ?? parsed.id ?? null,
        model: parsed.model ?? body.model,
      };
    },
  );
}

export interface ChatJsonInput<T> {
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Name for the json_schema response format, for example "chapter_memory". */
  jsonSchemaName: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Explicit cache breakpoint on the system prompt (Anthropic, Qwen and Gemini). */
  cacheControl?: CacheControl;
  /** Skips the catalog lookup that decides whether the model gets json_schema output. */
  structuredOutput?: boolean;
}

export interface ChatJsonResult<T> {
  data: T;
  /** Summed over the first call and the repair call, when one was made. */
  usage: ChatUsage;
  generationId: string | null;
  model: string;
}

/**
 * Asks for JSON that matches `schema` and validates it. A reply that fails parsing or validation
 * gets exactly one repair call, which includes the errors. A second failure throws
 * LLM_INVALID_OUTPUT.
 */
export async function chatJson<T>(
  deps: ChatDeps,
  input: ChatJsonInput<T>,
): Promise<ChatJsonResult<T>> {
  const structured =
    input.structuredOutput ??
    (await canUseStructuredOutput(deps.models, input.model, input.signal));
  const jsonSchema = toJsonSchema(input.schema);
  const responseFormat: ResponseFormat | undefined = structured
    ? {
        type: 'json_schema',
        json_schema: { name: input.jsonSchemaName, strict: true, schema: jsonSchema },
      }
    : undefined;

  const systemText = structured
    ? input.system
    : `${input.system}\n\n${jsonOnlyInstruction(jsonSchema)}`;
  const systemMessage: ChatMessage = {
    role: 'system',
    content: input.cacheControl
      ? [{ type: 'text', text: systemText, cache_control: input.cacheControl }]
      : systemText,
  };
  const userMessage: ChatMessage = { role: 'user', content: input.user };

  const first = await sendChatCompletion(
    deps,
    requestBody(input, [systemMessage, userMessage], responseFormat),
    input.signal,
  );
  const firstCheck = validate(first.content, input.schema);
  if (firstCheck.ok) return finish([first], firstCheck.value);

  const repairMessages: ChatMessage[] = [
    systemMessage,
    userMessage,
    { role: 'assistant', content: first.content.trim() || '(empty reply)' },
    {
      role: 'user',
      content: `Your reply failed validation: ${firstCheck.error}. Reply again with only a corrected JSON object that matches the schema. No prose, no code fences.`,
    },
  ];
  const second = await sendChatCompletion(
    deps,
    requestBody(input, repairMessages, responseFormat),
    input.signal,
  );
  const secondCheck = validate(second.content, input.schema);
  if (!secondCheck.ok) {
    throw pipelineFailure(
      'LLM_INVALID_OUTPUT',
      'The AI reply did not match the expected format, even after a retry.',
      { retryable: true, detail: secondCheck.error },
    );
  }
  return finish([first, second], secondCheck.value);
}

export interface ChatTextInput {
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatTextResult {
  text: string;
  usage: ChatUsage;
  generationId: string | null;
  model: string;
}

/** Free-form answer, for example a spoiler-safe Q&A reply. */
export async function chatText(deps: ChatDeps, input: ChatTextInput): Promise<ChatTextResult> {
  const messages: ChatMessage[] = [];
  if (input.system) messages.push({ role: 'system', content: input.system });
  messages.push({ role: 'user', content: input.user });

  const completion = await sendChatCompletion(
    deps,
    requestBody(input, messages, undefined),
    input.signal,
  );
  return {
    text: completion.content.trim(),
    usage: completion.usage,
    generationId: completion.generationId,
    model: completion.model,
  };
}

export interface ChatRawInput {
  model: string;
  system: string;
  user: string;
  /**
   * The reply must follow this schema. It is sent as strict `json_schema` when the catalog says the
   * model supports structured outputs, and otherwise as a JSON-only instruction in the system text.
   */
  jsonSchema?: { name: string; schema: object };
  signal?: AbortSignal;
  /**
   * Marks the system text as a cacheable prefix for models that need an explicit breakpoint
   * (anthropic/*, google/gemini*, qwen/*). Other models cache automatically, and the flag does nothing.
   */
  cacheSystem?: boolean;
  /** Sampling temperature. Sent only when given. */
  temperature?: number;
  /** Sampling seed. Sent only when given. */
  seed?: number;
}

export interface ChatRawResult {
  /** The reply text, unvalidated and untrimmed. The caller parses and validates it. */
  text: string;
  usage: ChatUsage;
  generationId: string | null;
  model: string;
}

/**
 * One chat call that returns the raw reply text and the usage, with no zod validation and no
 * repair call. The pipeline uses it, because the core validates replies itself and retries them
 * with its own rules.
 */
export async function chatRaw(deps: ChatDeps, input: ChatRawInput): Promise<ChatRawResult> {
  const structured =
    input.jsonSchema !== undefined &&
    (await canUseStructuredOutput(deps.models, input.model, input.signal));
  const responseFormat: ResponseFormat | undefined =
    input.jsonSchema && structured
      ? {
          type: 'json_schema',
          json_schema: {
            name: input.jsonSchema.name,
            strict: true,
            schema: input.jsonSchema.schema as Record<string, unknown>,
          },
        }
      : undefined;
  const system =
    input.jsonSchema && !structured
      ? `${input.system}\n\n${jsonOnlyInstruction(input.jsonSchema.schema as Record<string, unknown>)}`
      : input.system;

  const systemMessage: ChatMessage = {
    role: 'system',
    content:
      input.cacheSystem && needsExplicitCache(input.model)
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system,
  };
  const completion = await sendChatCompletion(
    deps,
    requestBody(input, [systemMessage, { role: 'user', content: input.user }], responseFormat),
    input.signal,
  );
  return {
    text: completion.content,
    usage: completion.usage,
    generationId: completion.generationId,
    model: completion.model,
  };
}

/** Providers that cache a prompt only when it carries an explicit `cache_control` breakpoint. */
const EXPLICIT_CACHE_MODEL = /^(anthropic\/|google\/gemini|qwen\/)/;

function needsExplicitCache(modelId: string): boolean {
  return EXPLICIT_CACHE_MODEL.test(modelId);
}

function requestBody(
  input: { model: string; temperature?: number; seed?: number; maxTokens?: number },
  messages: ChatMessage[],
  responseFormat: ResponseFormat | undefined,
): ChatRequestBody {
  return {
    model: input.model,
    messages,
    ...(responseFormat
      ? { response_format: responseFormat, provider: { require_parameters: true as const } }
      : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    usage: { include: true },
  };
}

async function canUseStructuredOutput(
  models: ModelCatalog,
  modelId: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  try {
    const catalog = await models.list({ outputModality: 'text', signal });
    const model = catalog.find((candidate) => candidate.id === modelId);
    return model !== undefined && supportsStructuredOutput(model);
  } catch (error) {
    // If the catalog is unreachable, fall back to the JSON-only instruction.
    if (error instanceof PipelineFailure && error.error.code !== 'CANCELLED') return false;
    throw error;
  }
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function validate<T>(content: string, schema: ZodType<T>): Validation<T> {
  const json = parseTolerantJson(content);
  if (!json.ok) return { ok: false, error: 'the reply was not valid JSON' };
  const parsed = schema.safeParse(json.value);
  if (!parsed.success) return { ok: false, error: summarizeIssues(parsed.error.issues) };
  return { ok: true, value: parsed.data };
}

function summarizeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 10)
    .map((issue) => `${issue.path.map(String).join('.') || 'root'}: ${issue.message}`)
    .join('; ');
}

function finish<T>(calls: ChatCompletion[], data: T): ChatJsonResult<T> {
  const last = calls[calls.length - 1];
  return {
    data,
    usage: sumUsage(calls.map((call) => call.usage)),
    generationId: last?.generationId ?? null,
    model: last?.model ?? '',
  };
}

function sumUsage(usages: ChatUsage[]): ChatUsage {
  const costs = usages.map((usage) => usage.costUsd);
  const costUsd = costs.every((cost): cost is number => cost !== null)
    ? costs.reduce((total, cost) => total + cost, 0)
    : null;
  return {
    promptTokens: usages.reduce((total, usage) => total + usage.promptTokens, 0),
    completionTokens: usages.reduce((total, usage) => total + usage.completionTokens, 0),
    costUsd,
  };
}

function toUsage(usage: z.infer<typeof completionSchema>['usage']): ChatUsage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    costUsd: typeof usage?.cost === 'number' ? usage.cost : null,
  };
}

/**
 * Converts a zod schema to JSON Schema (zod 4 built-in). The `$schema` marker is removed, because
 * OpenRouter's strict json_schema mode does not expect it.
 */
function toJsonSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  const json: Record<string, unknown> = {
    ...z.toJSONSchema(schema, { io: 'output', reused: 'inline' }),
  };
  delete json.$schema;
  return json;
}

function jsonOnlyInstruction(jsonSchema: Record<string, unknown>): string {
  return `Respond with only a single JSON object that matches this JSON Schema. No prose and no code fences.\nJSON Schema: ${JSON.stringify(jsonSchema)}`;
}

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { z } from "zod";

import { env } from "../config/env.ts";
import { AppError } from "../utils/errors.ts";
import { logger } from "../utils/logger.ts";
import { withRetry } from "../utils/retry.ts";

type ProviderName = "openai" | "nvidia_qwen";

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text: unknown }).text);
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return String(content ?? "");
}

export class LlmProvider {
  private readonly openAiModel = env.OPENAI_API_KEY
    ? new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      temperature: 0,
      timeout: env.LLM_TIMEOUT_MS,
      maxRetries: 0
    })
    : null;

  private readonly nvidiaQwenModel = env.NVIDIA_QWEN_API_KEY
    ? new ChatOpenAI({
        apiKey: env.NVIDIA_QWEN_API_KEY,
        model: env.NVIDIA_QWEN_MODEL,
        temperature: 0,
        configuration: {
          baseURL: env.NVIDIA_QWEN_BASE_URL
        },
        timeout: env.LLM_TIMEOUT_MS,
        maxRetries: 0
      })
    : null;

  private readonly nvidiaIntentModel = env.NVIDIA_QWEN_API_KEY && env.NVIDIA_INTENT_MODEL
    ? new ChatOpenAI({
        apiKey: env.NVIDIA_QWEN_API_KEY,
        model: env.NVIDIA_INTENT_MODEL,
        temperature: 0,
        configuration: {
          baseURL: env.NVIDIA_QWEN_BASE_URL
        },
        timeout: 30000, // Shorter timeout for intent
        maxRetries: 1
      })
    : null;

  public readonly embeddings =
    env.NVIDIA_EMBEDDING_MODEL && env.NVIDIA_QWEN_API_KEY
      ? new OpenAIEmbeddings({
          apiKey: env.NVIDIA_QWEN_API_KEY,
          model: env.NVIDIA_EMBEDDING_MODEL,
          configuration: {
            baseURL: env.NVIDIA_QWEN_BASE_URL
          }
        })
      : env.OPENAI_API_KEY
        ? new OpenAIEmbeddings({
            apiKey: env.OPENAI_API_KEY,
            model: env.OPENAI_EMBEDDING_MODEL
          })
        : null;

  constructor() {
    console.log("LlmProvider initialized");
    console.log("NVIDIA Base URL:", env.NVIDIA_QWEN_BASE_URL);
    console.log("NVIDIA LLM Model:", env.NVIDIA_QWEN_MODEL);
    console.log("NVIDIA Embedding Model:", env.NVIDIA_EMBEDDING_MODEL);
    
    if (!this.openAiModel && !this.nvidiaQwenModel) {
      throw new AppError("At least one LLM provider must be configured.", 500, "llm_not_configured");
    }
  }

  private getCandidates(useFastModel = false): Array<{ name: ProviderName; model: ChatOpenAI }> {
    const candidates: Array<{ name: ProviderName; model: ChatOpenAI }> = [];

    if (useFastModel && this.nvidiaIntentModel) {
      candidates.push({ name: "nvidia_qwen", model: this.nvidiaIntentModel });
      return candidates;
    }

    if (this.nvidiaQwenModel) {
      candidates.push({ name: "nvidia_qwen", model: this.nvidiaQwenModel });
      return candidates;
    }

    if (this.openAiModel) {
      candidates.push({ name: "openai", model: this.openAiModel });
    }

    return candidates;
  }

  async invokeStructured<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    params: {
      system: string;
      user: string;
      schemaName: string;
      useFastModel?: boolean;
    }
  ): Promise<{ provider: ProviderName; output: z.infer<TSchema> }> {
    let lastError: unknown;

    for (const candidate of this.getCandidates(params.useFastModel)) {
      try {
        // Try standard structured output first (for providers that support it natively)
        const runnable = candidate.model.withStructuredOutput(schema, {
          name: params.schemaName,
          method: "jsonSchema" // Fix typo: jsonSchema (camelCase)
        });

        const output = await withRetry(
          () =>
            runnable.invoke([
              new SystemMessage(params.system),
              new HumanMessage(params.user)
            ]),
          {
            attempts: 2,
            shouldRetry: (error: any) => 
               candidate.name === "openai" || 
               error.message?.includes("Rate limit") ||
               error.message?.includes("timeout")
          }
        );

        return {
          provider: candidate.name,
          output: output as z.infer<TSchema>
        };
      } catch (error: any) {
        // If it's a parsing error or validation error, try manual fallback
        if (error.name === "SyntaxError" || error.message?.includes("JSON") || error.message?.includes("Unexpected identifier") || error.issues) {
          logger.warn({ provider: candidate.name }, "Structured output parsing failed, falling back to manual extraction");
          
          try {
            const result = await this.invokeText({ 
              system: params.system + "\nIMPORTANT: Return ONLY valid JSON that matches the schema.", 
              user: params.user,
              useFastModel: params.useFastModel 
            });
            
            logger.debug({ text: result.text }, "Manual extraction raw text");

            // Extract JSON from text (fenced or just between brackets)
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const validated = schema.parse(parsed);
              return {
                provider: result.provider,
                output: validated
              };
            }
          } catch (fallbackError) {
            logger.error({ fallbackError }, "Manual JSON extraction fallback also failed");
          }
        }

        logger.warn(
          {
            provider: candidate.name,
            error: error instanceof Error ? error.message : error
          },
          "Structured LLM provider failed, trying next candidate"
        );
        lastError = error;
      }
    }

    throw lastError;
  }

  async invokeText(params: { system: string; user: string; useFastModel?: boolean }): Promise<{ provider: ProviderName; text: string }> {
    let lastError: unknown;

    for (const candidate of this.getCandidates(params.useFastModel)) {
      try {
        const result = await withRetry(
          () =>
            candidate.model.invoke([
              new SystemMessage(params.system),
              new HumanMessage(params.user)
            ]),
          {
            attempts: 2,
            shouldRetry: () => candidate.name === "openai"
          }
        );

        return {
          provider: candidate.name,
          text: extractTextContent(result.content)
        };
      } catch (error) {
        logger.warn(
          {
            provider: candidate.name,
            error: error instanceof Error ? error.message : error
          },
          "Text LLM provider failed, trying next candidate"
        );
        lastError = error;
      }
    }

    throw lastError;
  }
}

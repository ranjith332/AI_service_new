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
    if (!this.openAiModel && !this.nvidiaQwenModel) {
      throw new AppError("At least one LLM provider must be configured.", 500, "llm_not_configured");
    }
  }

  private getCandidates(): Array<{ name: ProviderName; model: ChatOpenAI }> {
    const candidates: Array<{ name: ProviderName; model: ChatOpenAI }> = [];

    if (this.nvidiaQwenModel) {
      candidates.push({ name: "nvidia_qwen", model: this.nvidiaQwenModel });
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
    }
  ): Promise<{ provider: ProviderName; output: z.infer<TSchema> }> {
    let lastError: unknown;

    for (const candidate of this.getCandidates()) {
      try {
        const runnable = candidate.model.withStructuredOutput(schema, {
          name: params.schemaName
        });
        const output = await withRetry(
          () =>
            runnable.invoke([
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
          output: output as z.infer<TSchema>
        };
      } catch (error) {
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

  async invokeText(params: { system: string; user: string }): Promise<{ provider: ProviderName; text: string }> {
    let lastError: unknown;

    for (const candidate of this.getCandidates()) {
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

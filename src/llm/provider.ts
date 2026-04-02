import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.ts";
import { logger } from "../utils/logger.ts";

export type LlmModel = "gpt-4o" | "gpt-4o-mini" | "nvidia_qwen";

export class LlmProvider {
  private primaryModel: ChatOpenAI | null = null;
  private fallbackModel: ChatOpenAI | null = null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.primaryModel = new ChatOpenAI({
        openAIApiKey: env.OPENAI_API_KEY,
        modelName: env.OPENAI_MODEL,
        temperature: 0,
        maxRetries: 0,
        timeout: 30000,
      });
    }

    if (env.NVIDIA_QWEN_API_KEY) {
      this.fallbackModel = new ChatOpenAI({
        apiKey: env.NVIDIA_QWEN_API_KEY,
        model: env.NVIDIA_QWEN_MODEL,
        temperature: 0,
        configuration: {
          baseURL: env.NVIDIA_QWEN_BASE_URL,
        },
        maxRetries: 1,
        timeout: 60000,
        modelKwargs: {
           response_format: { type: "json_object" }
        }
      });
    }

    if (!this.primaryModel && !this.fallbackModel) {
      logger.error("LLM Provider: No models available. Check .env");
    }
  }

  private extractAndParseJson<T>(text: string, schema?: any): T {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    
    if (start === -1 || end === -1 || end < start) {
      logger.error({ rawResponse: text }, "No valid JSON object delimiters found in response");
      throw new Error("No valid JSON object found in LLM response");
    }

    const jsonStr = text.substring(start, end + 1);
    
    try {
      const parsed = JSON.parse(jsonStr);
      
      // If we have a zod schema, validate the manually parsed result
      if (schema && typeof schema.parse === 'function') {
        try {
          return schema.parse(parsed) as T;
        } catch (zodError: any) {
          logger.warn({ zodError: zodError.message, parsed }, "Manual parse succeeded but Zod validation failed. Attempting to fix defaults...");
          
          // Emergency defaults if schema validation fails on the fallback
          // We manually construct a safe object based on the schema rather than spreading everything
          return {
            operation: parsed.operation || "lookup",
            justification: parsed.justification || "Automatically inferred intent",
            targets: Array.isArray(parsed.targets) ? parsed.targets : [],
            filters: {
                patientName: parsed.filters?.patientName || parsed.filters?.prescriptionFor || parsed.filters?.name || undefined,
                doctorName: parsed.filters?.doctorName || undefined,
                status: parsed.filters?.status || undefined,
                date: parsed.filters?.date || undefined,
                limit: parsed.filters?.limit || 5
            }
          } as T;
        }
      }
      
      return parsed as T;
    } catch (error: any) {
      logger.error({ 
        error: error.message, 
        failedSnippet: jsonStr, 
        fullRaw: text 
      }, "Greedy JSON parse failed");
      throw new Error(`JSON Parse error at source: ${error.message}`);
    }
  }

  async invokeWithStructuredOutput<T>(
    prompt: string,
    schema: any,
    model: LlmModel = "gpt-4o-mini"
  ): Promise<T> {
    if (this.primaryModel) {
      try {
        const response = await this.primaryModel.withStructuredOutput(schema).invoke(prompt);
        return response as T;
      } catch (error: any) {
        logger.warn({ error: error.message }, "Primary LLM failed, attempting fallback to NVIDIA...");
      }
    }

    if (this.fallbackModel) {
      try {
        const strictPrompt = `${prompt}\n\nIMPORTANT: YOU MUST RESPOND ONLY WITH RAW JSON. DO NOT INCLUDE MARKDOWN CODE BLOCKS, COMMENTS, OR ANY OTHER TEXT. START WITH { AND END WITH }.`;
        
        try {
          const response = await this.fallbackModel.withStructuredOutput(schema).invoke(strictPrompt);
          return response as T;
        } catch (structuredError: any) {
          logger.warn({ error: structuredError.message }, "Structured output failed for NVIDIA, attempting manual extraction...");
          
          const rawResponse = await this.fallbackModel.invoke(strictPrompt);
          const rawText = typeof rawResponse.content === 'string' ? rawResponse.content : JSON.stringify(rawResponse.content);
          return this.extractAndParseJson<T>(rawText, schema);
        }
      } catch (error: any) {
        logger.error({ error: error.message }, "Fallback LLM (NVIDIA) also failed.");
        throw error;
      }
    }

    throw new Error("No LLM provider available to handle request");
  }

  getFastModel() {
    if (this.primaryModel && this.fallbackModel) {
      return this.primaryModel.withFallbacks([this.fallbackModel]);
    }
    return this.primaryModel || this.fallbackModel;
  }
}

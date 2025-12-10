import {
  RunnableSequence,
  RunnablePassthrough,
  RunnableLambda,
} from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { BaseRetriever } from "@langchain/core/retrievers";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ragPrompt, createRAGPromptWithHistory } from "../prompts/rag.js";
import { logger } from "../logger.js";
import { ProductContextManager } from "../utils/product-context.js";
import { ProductListItem } from "../orchestrator/index.js";
import { createSecureParserWithRetryAndFixing, DEFAULT_CONFIG } from "../security/guardrails.js";

export interface AgentResponse {
  answer: string;
  sources: Array<{
    id: string;
    text: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  productList?: ProductListItem[];
  metadata: {
    agent: string;
    model: string;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    timings: {
      retrievalMs: number;
      llmGenerationMs: number;
      totalMs: number;
    };
  };
}

export function createRAGChain(
  retriever: BaseRetriever,
  llm: BaseChatModel,
  agentName: string,
  useHistory: boolean = false,
  language?: string,
): RunnableSequence {
  const prompt = useHistory ? createRAGPromptWithHistory(language) : ragPrompt;
  const secureParser = createSecureParserWithRetryAndFixing(llm, DEFAULT_CONFIG);
  const baseChain = prompt.pipe(llm);
  const guardedChain = prompt.pipe(llm).pipe(secureParser);

  return RunnableSequence.from([
    RunnablePassthrough.assign({
      documents: async (input: { question: string; chat_history?: Array<[string, string]> }) => {
        const retrievalStartTime = Date.now();
        
        const docs = await retriever.invoke(input.question);
        const searchTimeMs = Date.now() - retrievalStartTime;

        const productList = ProductContextManager.extractFromDocuments(docs);

        logger.debug(
          {
            originalQuery: input.question,
            documentCount: docs.length,
            productCount: productList.length,
            searchTimeMs,
            agent: agentName
          },
          "Documents retrieved",
        );
        return {
          docs,
          searchTimeMs,
          productList,
          chat_history: input.chat_history as Array<[string, string]> | undefined
        };
      },
    }),
    RunnablePassthrough.assign({
      answer: async (input: {
        question: string;
        documents: { docs: Document[]; searchTimeMs: number; productList: ProductListItem[] };
        chat_history?: Array<[string, string]>;
      }) => {
        const llmStartTime = Date.now();

        if (input.documents.docs.length === 0) {
          logger.info({ agent: agentName }, "No documents retrieved");
          return {
            answer:
              "I couldn't find any products matching your query. Could you try rephrasing your question?",
            tokenUsage: undefined,
            timingMs: Date.now() - llmStartTime,
          };
        }

        const context = input.documents.docs
          .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
          .join("\n\n");

        let messages: Array<HumanMessage | AIMessage> = [];
        if (useHistory && input.chat_history && input.chat_history.length > 0) {
          messages = input.chat_history.map((tuple) => {
            const [role, content] = tuple;
            return role === "human" ? new HumanMessage(content) : new AIMessage(content);
          });
          logger.info(
            {
              agent: agentName,
              historyLength: input.chat_history.length,
            },
            "Passing chat history to LLM",
          );
        }

        const chainInput: {
          question: string;
          context: string;
          chat_history: Array<HumanMessage | AIMessage>;
        } = {
          question: input.question,
          context,
          chat_history: messages,
        };

        logger.info(
          {
            agent: agentName,
            questionLength: input.question.length,
            contextLength: context.length,
            historyLength: messages.length,
          },
          "Invoking LLM chain",
        );

        let response: string;
        let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
        
        try {
          const rawResponsePromise = baseChain.invoke(chainInput);
          const guardedResponsePromise = guardedChain.invoke(chainInput);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("LLM call timeout after 60 seconds")), 60000)
          );
          
          const [rawResponse, parsedResponse] = await Promise.all([
            Promise.race([rawResponsePromise, timeoutPromise]),
            Promise.race([guardedResponsePromise, timeoutPromise])
          ]);
          
          const responseMetadata = (rawResponse as { response_metadata?: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } }).response_metadata;
          const usage = responseMetadata?.usage;
          tokenUsage = usage
            ? {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
              }
                : undefined;
          
          response = parsedResponse as string;
          
          logger.info(
            { agent: agentName, responseLength: response?.length || 0 },
            "LLM chain invocation completed with LangChain guardrails",
          );
        } catch (error) {
          logger.error({ error, agent: agentName, question: input.question.substring(0, 100) }, "Error invoking LLM chain");
          throw error;
        }

        return {
          answer: response,
          tokenUsage: tokenUsage,
          timingMs: Date.now() - llmStartTime,
        };
      },
    }),
    RunnableLambda.from(
      (input: {
        question: string;
        documents: { docs: Document[]; searchTimeMs: number; productList: ProductListItem[] };
        answer: {
          answer: string;
          tokenUsage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          };
          timingMs: number;
        };
        chat_history?: Array<HumanMessage | AIMessage>;
      }): AgentResponse => {
        const totalTimeMs =
          input.documents.searchTimeMs + input.answer.timingMs;

        return {
          answer: input.answer.answer,
          sources: input.documents.docs.map((doc: Document, index: number) => {
            const { sourceId, source, ...metadataWithoutSource } = doc.metadata;

            const finalSourceId = sourceId || source || "unknown";
            return {
              id: doc.metadata.id as string || `chunk-${index}`,
              text: doc.pageContent,
              sourceId: finalSourceId as string,
              metadata: metadataWithoutSource,
            };
          }),
          productList: input.documents.productList,
          metadata: {
            agent: agentName,
            model:
              "modelName" in llm
                ? (llm as { modelName: string }).modelName
                : "model" in llm
                  ? (llm as { model: string }).model
                  : "unknown",
            tokenUsage: input.answer.tokenUsage,
            timings: {
              retrievalMs: input.documents.searchTimeMs,
              llmGenerationMs: input.answer.timingMs,
              totalMs: totalTimeMs,
            },
          },
        };
      },
    ),
  ]);
}

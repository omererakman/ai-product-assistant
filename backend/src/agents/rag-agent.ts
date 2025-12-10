import { VectorStore } from "@langchain/core/vectorstores";
import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createRetriever } from "../retrievers/index.js";
import { createOpenAILLM } from "../llm/index.js";
import { createRAGChain, AgentResponse } from "../chains/rag-chain.js";
import { createRAGPromptWithHistory } from "../prompts/rag.js";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";
import { ProductContextManager } from "../utils/product-context.js";
import { ChatMessage } from "../orchestrator/index.js";
import { GuardrailsCallbackHandler, DEFAULT_CONFIG } from "../security/index.js";

export class RAGAgent {
  private retriever: BaseRetriever | null = null;
  private retrieverPromise: Promise<BaseRetriever> | null = null;
  private chain: ReturnType<typeof createRAGChain> | null = null;
  private chainPromise: Promise<ReturnType<typeof createRAGChain>> | null = null;
  public readonly name: string = "product-info";
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
    this._initialize();
  }

  private async _initialize() {
    const config = getConfig();
    this.retrieverPromise = createRetriever(this.vectorStore);
    this.retriever = await this.retrieverPromise;
    const llm = createOpenAILLM(config, {
      streaming: false,
      callbacks: [new GuardrailsCallbackHandler(DEFAULT_CONFIG)],
    });
    this.chain = createRAGChain(this.retriever, llm, this.name, true);
    this.chainPromise = Promise.resolve(this.chain);
    logger.debug({ agent: this.name }, "RAG Agent initialized with guardrails");
  }

  private async ensureInitialized() {
    if (!this.retriever || !this.chain) {
      if (this.retrieverPromise && this.chainPromise) {
        await Promise.all([this.retrieverPromise, this.chainPromise]);
      } else {
        await this._initialize();
      }
    }
    if (!this.chain) {
      throw new Error("Failed to initialize RAG chain");
    }
    if (!this.retriever) {
      throw new Error("Failed to initialize retriever");
    }
  }

  async invoke(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = [],
    language?: string,
  ): Promise<AgentResponse> {
    await this.ensureInitialized();

    logger.info(
      { agent: this.name, question: question.substring(0, 100), historyLength: chatHistory.length },
      "RAG Agent: Processing question",
    );

    let processedQuestion = question;
    if (ProductContextManager.containsOrdinalReference(question)) {
      const latestProducts = ProductContextManager.getLatestProductList(
        chatHistory as ChatMessage[]
      );

      if (latestProducts) {
        const resolved = ProductContextManager.resolveOrdinalReference(
          question,
          latestProducts
        );

        if (resolved) {
          logger.info(
            { originalQuestion: question, resolvedProduct: resolved.name },
            "Resolved ordinal reference to specific product"
          );

          processedQuestion = question.replace(
            /\b(?:the\s+)?(?:first|second|third|fourth|fifth|last|number\s+\d+|\d+(?:st|nd|rd|th))(?:\s+one)?\b/i,
            resolved.name
          );

          logger.debug(
            { originalQuestion: question, rewrittenQuestion: processedQuestion },
            "Rewrote question with explicit product name"
          );
        }
      }
    }

    const previousMessages = chatHistory.slice(0, -1);
    const formattedHistory: Array<[string, string]> = previousMessages
      .map((msg) => [msg.role === "user" ? "human" : "ai", msg.content]);

    logger.info(
      {
        agent: this.name,
        historyLength: formattedHistory.length,
        currentQuestion: processedQuestion.substring(0, 100)
      },
      "RAG Agent: Formatted chat history",
    );

    const chainInput: { question: string; chat_history?: Array<[string, string]> } = {
      question: processedQuestion,
    };

    if (formattedHistory.length > 0) {
      chainInput.chat_history = formattedHistory;
    }

    logger.info({ chainInput: { question: chainInput.question.substring(0, 100), hasHistory: !!chainInput.chat_history }, language }, "RAG Agent: Invoking chain");

    let result: AgentResponse;
    try {
      const chainStartTime = Date.now();
      // If language is provided, recreate chain with language-aware prompt
      let chainToUse = this.chain!;
      if (language) {
        const config = getConfig();
        const llm = createOpenAILLM(config, {
          streaming: false,
          callbacks: [new GuardrailsCallbackHandler(DEFAULT_CONFIG)],
        });
        chainToUse = createRAGChain(this.retriever!, llm, this.name, true, language);
      }
      result = await chainToUse.invoke(chainInput) as AgentResponse;
      const chainDuration = Date.now() - chainStartTime;

      logger.info({ answerLength: result.answer?.length || 0, hasSources: !!result.sources, duration: chainDuration }, "RAG Agent: Chain invocation completed with LangChain guardrails");
      return result;
    } catch (error) {
      logger.error({ error, question: processedQuestion.substring(0, 100) }, "RAG Agent: Error invoking chain");
      throw error;
    }
  }

  async stream(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = [],
    language?: string,
    onToken?: (token: string) => void,
  ): Promise<AgentResponse> {
    await this.ensureInitialized();

    logger.debug(
      { agent: this.name, question: question.substring(0, 100), historyLength: chatHistory.length },
      "Streaming question",
    );

    let processedQuestion = question;
    if (ProductContextManager.containsOrdinalReference(question)) {
      const latestProducts = ProductContextManager.getLatestProductList(
        chatHistory as ChatMessage[]
      );

      if (latestProducts) {
        const resolved = ProductContextManager.resolveOrdinalReference(
          question,
          latestProducts
        );

        if (resolved) {
          processedQuestion = question.replace(
            /\b(?:the\s+)?(?:first|second|third|fourth|fifth|last|number\s+\d+|\d+(?:st|nd|rd|th))(?:\s+one)?\b/i,
            resolved.name
          );
        }
      }
    }

    const previousMessages = chatHistory.slice(0, -1);
    const formattedHistory: Array<[string, string]> = previousMessages
      .map((msg) => [msg.role === "user" ? "human" : "ai", msg.content]);

    const chainInput: { question: string; chat_history?: Array<[string, string]> } = {
      question: processedQuestion,
    };

    if (formattedHistory.length > 0) {
      chainInput.chat_history = formattedHistory;
    }

    const retrievalStartTime = Date.now();
    const docs = await this.retriever!.invoke(processedQuestion);
    const searchTimeMs = Date.now() - retrievalStartTime;

    const productList = ProductContextManager.extractFromDocuments(docs);

    if (docs.length === 0) {
      const answer = "I couldn't find any products matching your query. Could you try rephrasing your question?";
      onToken?.(answer);
      return {
        answer,
        sources: [],
        productList,
        metadata: {
          agent: this.name,
          model: "unknown",
          timings: {
            retrievalMs: searchTimeMs,
            llmGenerationMs: 0,
            totalMs: searchTimeMs,
          },
        },
      };
    }

    const context = docs.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join("\n\n");

    let messages: Array<HumanMessage | AIMessage> = [];
    if (formattedHistory.length > 0) {
      messages = formattedHistory.map((tuple) => {
        const [role, content] = tuple;
        return role === "human" ? new HumanMessage(content) : new AIMessage(content);
      });
    }

    const prompt = createRAGPromptWithHistory(language);
    const config = getConfig();
    const streamingLLM = createOpenAILLM(config, {
      streaming: true,
      callbacks: [new GuardrailsCallbackHandler(DEFAULT_CONFIG)],
    });
    const streamingChain = prompt.pipe(streamingLLM);

    const chainInputForLLM = {
      question: processedQuestion,
      context,
      chat_history: messages,
    };

    logger.info({ 
      question: processedQuestion, 
      contextLength: context.length, 
      historyLength: messages.length 
    }, "RAG Agent Stream: About to stream with LLM");

    const chain = streamingChain;

    const llmStartTime = Date.now();
    let fullAnswer = "";
    let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    try {
      const streamPromise = chain.stream(chainInputForLLM);
      const stream = await streamPromise;
      
      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        
        let delta = "";
        
        if (chunk instanceof AIMessage) {
          const msgContent = chunk.content;
          if (typeof msgContent === "string") {
            delta = msgContent;
          } else if (Array.isArray(msgContent)) {
            delta = msgContent
              .map((block: any) => {
                if (typeof block === "string") return block;
                if (block && typeof block === "object" && "text" in block) return block.text;
                return "";
              })
              .join("");
          }
        } else if (chunk && typeof chunk === "object") {
          if ("content" in chunk) {
            const chunkContent = (chunk as any).content;
            if (typeof chunkContent === "string") {
              delta = chunkContent;
            } else if (Array.isArray(chunkContent)) {
              delta = chunkContent
                .map((block: any) => {
                  if (typeof block === "string") return block;
                  if (block && typeof block === "object" && "text" in block) return block.text;
                  return "";
                })
                .join("");
            }
          } else if ("text" in chunk) {
            const textValue = (chunk as any).text;
            if (typeof textValue === "string") {
              delta = textValue;
            }
          }
        } else if (typeof chunk === "string") {
          delta = chunk;
        }
        
        if (delta) {
          fullAnswer += delta;
          onToken?.(delta);
        }
      }
      
      logger.debug({ totalChunks: chunkCount, finalAnswerLength: fullAnswer.length }, "RAG Agent Stream: Stream completed");
    } catch (error) {
      logger.error({ error }, "Error during streaming");
      throw error;
    }

    const timingMs = Date.now() - llmStartTime;
    const finalAnswer = fullAnswer;

    return {
      answer: finalAnswer,
      sources: docs.map((doc: Document, index: number) => {
        const { sourceId, source, ...metadataWithoutSource } = doc.metadata;
        const finalSourceId = sourceId || source || "unknown";
        return {
          id: doc.metadata.id as string || `chunk-${index}`,
          text: doc.pageContent,
          sourceId: finalSourceId as string,
          metadata: metadataWithoutSource,
        };
      }),
      productList,
      metadata: {
        agent: this.name,
        model: "modelName" in streamingLLM ? (streamingLLM as { modelName: string }).modelName : "unknown",
        tokenUsage,
        timings: {
          retrievalMs: searchTimeMs,
          llmGenerationMs: timingMs,
          totalMs: searchTimeMs + timingMs,
        },
      },
    };
  }
}

import { RAGAgent } from "../agents/rag-agent.js";
import { OrderAgent } from "../agents/order-agent.js";
import { logger } from "../logger.js";

export interface ProductListItem {
  position: number; // 1-indexed position in list
  product_id: string;
  name: string;
  price: number;
  category: string;
  stock_status: string;
  specifications?: Record<string, string>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  metadata?: {
    productList?: ProductListItem[];
    agent?: "rag" | "order";
  };
}

export interface OrchestratorResponse {
  response: string;
  agent: "rag" | "order";
  orderCreated?: boolean;
  orderId?: string;
  sources?: Array<{
    id: string;
    text: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
}

export class Orchestrator {
  private ragAgent: RAGAgent;
  private orderAgent: OrderAgent;
  private chatHistory: ChatMessage[] = [];

  constructor(ragAgent: RAGAgent, orderAgent: OrderAgent) {
    this.ragAgent = ragAgent;
    this.orderAgent = orderAgent;
    logger.debug("Orchestrator initialized");
  }

  private detectOrderIntent(message: string, history: ChatMessage[]): boolean {
    const orderKeywords = [
      "buy",
      "purchase",
      "order",
      "place order",
      "checkout",
      "i'll take",
      "i want to buy",
      "add to cart",
      "confirm",
      "yes, please",
      "yes please",
      "proceed",
      "complete purchase",
    ];

    const lowerMessage = message.toLowerCase();
    const hasOrderKeyword = orderKeywords.some((keyword) =>
      lowerMessage.includes(keyword),
    );

    const recentHistory = history.slice(-3).map((m) => m.content.toLowerCase());
    const hasConfirmation = recentHistory.some((h) =>
      h.includes("yes") || h.includes("confirm") || h.includes("proceed"),
    );

    return hasOrderKeyword || hasConfirmation;
  }

  async processMessage(
    message: string,
    language?: string,
    langfuseTrace?: any
  ): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const orchestratorSpan = langfuseTrace?.span({
      name: "orchestrator",
      metadata: {
        messageLength: message.length,
        historyLength: this.chatHistory.length,
      },
    });

    logger.info({ message: message.substring(0, 100) }, "Processing message");

    this.chatHistory.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });

    const intentDetectionSpan = orchestratorSpan?.span({
      name: "intent-detection",
    });
    const hasOrderIntent = this.detectOrderIntent(message, this.chatHistory);
    intentDetectionSpan?.end({
      metadata: {
        hasOrderIntent,
        detectedAgent: hasOrderIntent ? "order" : "rag",
      },
    });

    if (hasOrderIntent) {
      logger.info("Order intent detected, routing to Order Agent");
      
      const orderAgentSpan = orchestratorSpan?.span({
        name: "order-agent",
      });

      const orderResponse = await this.orderAgent.invoke(
        message,
        this.chatHistory,
        language,
      );

      orderAgentSpan?.end({
        metadata: {
          orderCreated: orderResponse.orderCreated,
          orderId: orderResponse.orderId,
          responseLength: orderResponse.response.length,
        },
      });

      this.chatHistory.push({
        role: "assistant",
        content: orderResponse.response,
        timestamp: new Date().toISOString(),
        metadata: {
          productList: orderResponse.productList,
          agent: "order",
        },
      });

      orchestratorSpan?.end({
        metadata: {
          agent: "order",
          latency: Date.now() - startTime,
        },
      });

      return {
        response: orderResponse.response,
        agent: "order",
        orderCreated: orderResponse.orderCreated,
        orderId: orderResponse.orderId,
      };
    } else {
      logger.info("Product query detected, routing to RAG Agent");
      
      const ragAgentSpan = orchestratorSpan?.span({
        name: "rag-agent",
      });

      const ragResponse = await this.ragAgent.invoke(
        message,
        this.chatHistory,
        language,
      );

      ragAgentSpan?.end({
        metadata: {
          sourcesCount: ragResponse.sources?.length || 0,
          responseLength: ragResponse.answer.length,
        },
      });

      this.chatHistory.push({
        role: "assistant",
        content: ragResponse.answer,
        timestamp: new Date().toISOString(),
        metadata: {
          productList: ragResponse.productList,
          agent: "rag",
        },
      });

      orchestratorSpan?.end({
        metadata: {
          agent: "rag",
          latency: Date.now() - startTime,
        },
      });

      return {
        response: ragResponse.answer,
        agent: "rag",
        sources: ragResponse.sources,
      };
    }
  }

  getHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  clearHistory(): void {
    this.chatHistory = [];
    logger.debug("Conversation history cleared");
  }

  async processMessageStream(
    message: string,
    language: string | undefined,
    onToken: (chunk: { type: string; content?: string; [key: string]: unknown }) => void,
    langfuseTrace?: any
  ): Promise<OrchestratorResponse> {
    const startTime = Date.now();
    const orchestratorSpan = langfuseTrace?.span({
      name: "orchestrator-stream",
      metadata: {
        messageLength: message.length,
        historyLength: this.chatHistory.length,
      },
    });

    logger.debug({ message: message.substring(0, 100) }, "Processing message with streaming");

    this.chatHistory.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    });

    const hasOrderIntent = this.detectOrderIntent(message, this.chatHistory);

    if (hasOrderIntent) {
      logger.debug("Order intent detected, routing to Order Agent (streaming)");

      const orderAgentSpan = orchestratorSpan?.span({
        name: "order-agent-stream",
      });

      const orderResponse = await this.orderAgent.stream(
        message,
        this.chatHistory,
        language,
        (token: string) => {
          onToken({ type: "token", content: token });
        }
      );

      orderAgentSpan?.end({
        metadata: {
          orderCreated: orderResponse.orderCreated,
          orderId: orderResponse.orderId,
          responseLength: orderResponse.response.length,
        },
      });

      this.chatHistory.push({
        role: "assistant",
        content: orderResponse.response,
        timestamp: new Date().toISOString(),
        metadata: {
          productList: orderResponse.productList,
          agent: "order",
        },
      });

      onToken({
        type: "metadata",
        agent: "order",
        orderCreated: orderResponse.orderCreated,
        orderId: orderResponse.orderId,
        productList: orderResponse.productList,
      });

      orchestratorSpan?.end({
        metadata: {
          agent: "order",
          latency: Date.now() - startTime,
        },
      });

      return {
        response: orderResponse.response,
        agent: "order",
        orderCreated: orderResponse.orderCreated,
        orderId: orderResponse.orderId,
      };
    } else {
      logger.debug("Product query detected, routing to RAG Agent (streaming)");

      const ragAgentSpan = orchestratorSpan?.span({
        name: "rag-agent-stream",
      });

      const ragResponse = await this.ragAgent.stream(
        message,
        this.chatHistory,
        language,
        (token: string) => {
          onToken({ type: "token", content: token });
        }
      );

      ragAgentSpan?.end({
        metadata: {
          sourcesCount: ragResponse.sources?.length || 0,
          responseLength: ragResponse.answer.length,
        },
      });

      this.chatHistory.push({
        role: "assistant",
        content: ragResponse.answer,
        timestamp: new Date().toISOString(),
        metadata: {
          productList: ragResponse.productList,
          agent: "rag",
        },
      });

      onToken({
        type: "metadata",
        agent: "rag",
        sources: ragResponse.sources,
        productList: ragResponse.productList,
      });

      orchestratorSpan?.end({
        metadata: {
          agent: "rag",
          latency: Date.now() - startTime,
        },
      });

      return {
        response: ragResponse.answer,
        agent: "rag",
        sources: ragResponse.sources,
      };
    }
  }
}

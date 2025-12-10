export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
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

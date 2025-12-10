import { useState, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface StreamingChatChunk {
  type: 'token' | 'metadata' | 'error' | 'done';
  content?: string;
  agent?: 'rag' | 'order';
  sources?: Array<{
    id: string;
    text: string;
    sourceId: string;
    metadata: Record<string, unknown>;
  }>;
  orderCreated?: boolean;
  orderId?: string;
  productList?: Array<{
    position: number;
    product_id: string;
    name: string;
    price: number;
    category: string;
    stock_status: string;
    specifications?: Record<string, string>;
  }>;
  finalText?: string;
  error?: string;
}

interface UseStreamingChatOptions {
  sessionId: string;
  language?: string;
  onComplete?: (response: {
    text: string;
    agent: 'rag' | 'order';
    sources?: StreamingChatChunk['sources'];
    orderCreated?: boolean;
    orderId?: string;
  }) => void;
  onError?: (error: Error) => void;
}

export function useStreamingChat(options: UseStreamingChatOptions) {
  const { sessionId, language, onComplete, onError } = options;
  
  const [streamingText, setStreamingText] = useState('');
  const [metadata, setMetadata] = useState<StreamingChatChunk['metadata'] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedTextRef = useRef('');
  const updateTimeoutRef = useRef<number | null>(null);
  const isStreamingRef = useRef(false); // Use ref to prevent duplicate calls in StrictMode

  const sendMessage = useCallback(async (message: string) => {
    if (isStreamingRef.current) {
      return;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    isStreamingRef.current = true;
    setStreamingText('');
    setMetadata(null);
    setIsStreaming(true);
    accumulatedTextRef.current = '';
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, sessionId, language }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (buffer.trim()) {
            const lines = buffer.split('\n\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data: StreamingChatChunk = JSON.parse(line.slice(6));
                  if (data.type === 'token' && data.content) {
                    accumulatedTextRef.current += data.content;
                    setStreamingText(accumulatedTextRef.current);
                  }
                } catch (e) {
                }
              }
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: StreamingChatChunk = JSON.parse(line.slice(6));

                if (data.type === 'token' && data.content) {
                  accumulatedTextRef.current += data.content;
                  const newText = accumulatedTextRef.current;
                  
                  if (updateTimeoutRef.current) {
                    clearTimeout(updateTimeoutRef.current);
                  }
                  
                  setStreamingText(newText);
                  
                  updateTimeoutRef.current = window.setTimeout(() => {
                    setStreamingText(prev => accumulatedTextRef.current);
                  }, 0);
                } else if (data.type === 'metadata') {
                  setMetadata(data);
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Unknown error');
                } else if (data.type === 'done') {
                  isStreamingRef.current = false;
                  setIsStreaming(false);
                  const finalText = data.finalText || accumulatedTextRef.current;
                  if (finalText) {
                    accumulatedTextRef.current = finalText;
                    setStreamingText(finalText);
                  }
                  setTimeout(() => {
                    setStreamingText('');
                    accumulatedTextRef.current = '';
                  }, 100);
                  if (onComplete && data.agent) {
                    onComplete({
                      text: finalText,
                      agent: data.agent,
                      sources: data.sources,
                      orderCreated: data.orderCreated,
                      orderId: data.orderId,
                    });
                  }
                  return;
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete messages
              }
            }
          }
        }
      }

      isStreamingRef.current = false;
      setIsStreaming(false);
    } catch (error) {
      isStreamingRef.current = false;
      setIsStreaming(false);
      setStreamingText('');
      accumulatedTextRef.current = '';
      
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const err = error instanceof Error ? error : new Error('Streaming failed');
      onError?.(err);
    } finally {
      abortControllerRef.current = null;
    }
  }, [sessionId, onComplete, onError]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    setIsStreaming(false);
    setStreamingText('');
    accumulatedTextRef.current = '';
  }, []);

  return {
    streamingText,
    metadata,
    isStreaming,
    sendMessage,
    cancel,
  };
}

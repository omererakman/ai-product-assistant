import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import { getConfig } from "./config/env.js";
import { logger } from "./logger.js";
import { loadChromaVectorStore } from "./vector-stores/index.js";
import { RAGAgent } from "./agents/rag-agent.js";
import { OrderAgent } from "./agents/order-agent.js";
import { Orchestrator, OrchestratorResponse } from "./orchestrator/index.js";
import { createDatabase, getOrderById, getAllOrders, cancelOrder, deleteOrder } from "./database/index.js";
import { getLangfuse, safeLangfuseOperation } from "./utils/langfuse.js";
import {
  calculateAudioQualityMetrics,
  isAudioQualityAcceptable,
  getQualityAssessment,
  type AudioMetadata,
} from "./utils/audioQuality.js";
import {
  rateLimitMiddleware,
  inputValidationMiddleware,
  requestSizeLimitMiddleware,
  sessionValidationMiddleware,
  securityHeadersMiddleware,
  chatRateLimiter,
  ttsRateLimiter,
  transcribeRateLimiter,
} from "./security/middleware.js";

const config = getConfig();
const app = express();

app.use(securityHeadersMiddleware);

app.use(requestSizeLimitMiddleware(10 * 1024 * 1024));

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      "audio/webm",
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/x-m4a",
      "audio/ogg",
      "audio/oga",
      "audio/flac",
      "audio/x-flac",
      "audio/mpga",
      "video/webm",
    ];
    
    const allowedExtensions = [".webm", ".wav", ".mp3", ".mp4", ".m4a", ".ogg", ".oga", ".flac", ".mpga", ".mpeg"];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Received: ${file.mimetype}, filename: ${file.originalname}. Supported formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm`));
    }
  },
});

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

const sessions = new Map<string, Orchestrator>();

async function getOrchestrator(sessionId: string): Promise<Orchestrator> {
  if (!sessions.has(sessionId)) {
    logger.debug({ sessionId }, "Creating new orchestrator session");
    try {
      const vectorStore = await loadChromaVectorStore("products");
      const ragAgent = new RAGAgent(vectorStore);
      const orderAgent = new OrderAgent();
      const orchestrator = new Orchestrator(ragAgent, orderAgent);
      sessions.set(sessionId, orchestrator);
      logger.debug({ sessionId }, "Orchestrator session created and cached");
    } catch (error) {
      logger.error({ error, sessionId }, "Error creating orchestrator");
      throw error;
    }
  }
  return sessions.get(sessionId)!;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/tts/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    supported: true,
    provider: "openai",
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
  });
});

app.post(
  "/api/transcribe",
  rateLimitMiddleware(transcribeRateLimiter, "transcribe"),
  upload.single("audio"),
  async (req, res) => {
  const langfuse = getLangfuse();
  const traceId = req.headers["x-langfuse-trace-id"] as string | undefined;
  const sessionId = req.headers["x-session-id"] as string | undefined;
  
  const trace = traceId && langfuse
    ? langfuse.trace({ id: traceId, name: "audio-transcription" })
    : langfuse?.trace({
        name: "audio-transcription",
        metadata: { sessionId: sessionId || "unknown" },
      });

  const transcriptionSpan = trace?.span({
    name: "transcription",
    metadata: {
      endpoint: "/api/transcribe",
    },
  });

  const startTime = Date.now();

  try {
    if (!req.file) {
      transcriptionSpan?.update({
        level: "ERROR",
        metadata: { error: "Audio file is required" },
      });
      trace?.update({ metadata: { error: "Audio file is required", status: "ERROR" } });
      return res.status(400).json({ error: "Audio file is required" });
    }

    const file = req.file;

    const mimeToExtension: Record<string, string> = {
      "audio/webm": ".webm",
      "video/webm": ".webm",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav",
      "audio/mpeg": ".mp3",
      "audio/mp3": ".mp3",
      "audio/mp4": ".mp4",
      "audio/ogg": ".ogg",
      "audio/flac": ".flac",
      "audio/x-flac": ".flac",
      "audio/x-m4a": ".m4a",
      "audio/m4a": ".m4a",
      "audio/mpga": ".mpga",
      "audio/oga": ".oga",
    };

    const extension = mimeToExtension[file.mimetype] || ".webm";
    
    let filename = file.originalname;
    if (!filename.toLowerCase().endsWith(extension.toLowerCase())) {
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
      filename = `${nameWithoutExt}${extension}`;
    }

    const audioMetadata: AudioMetadata = {
      mimeType: file.mimetype,
      fileSize: file.size,
    };

    const qualityMetrics = calculateAudioQualityMetrics(audioMetadata);
    const qualityAssessment = getQualityAssessment(qualityMetrics);

    logger.debug(
      {
        filename: file.originalname,
        normalizedFilename: filename,
        mimetype: file.mimetype,
        size: file.size,
        qualityScore: qualityMetrics.qualityScore,
        qualityLevel: qualityAssessment.level,
      },
      "Received audio file for transcription",
    );

    transcriptionSpan?.update({
      metadata: {
        audioQuality: {
          qualityScore: qualityMetrics.qualityScore,
          qualityLevel: qualityAssessment.level,
          snr: qualityMetrics.snr,
          rms: qualityMetrics.rms,
          fileSize: qualityMetrics.fileSize,
          mimeType: file.mimetype,
        },
      },
    });

    if (langfuse) {
      safeLangfuseOperation(async () => {
        trace?.score({
          name: "audio-quality",
          value: qualityMetrics.qualityScore,
          comment: qualityAssessment.message,
        });
      });
    }

    if (!isAudioQualityAcceptable(qualityMetrics)) {
      logger.warn(
        {
          qualityScore: qualityMetrics.qualityScore,
          suggestions: qualityAssessment.suggestions,
        },
        "Audio quality is below optimal threshold",
      );
    }

    let audioFile: File | Blob;
    
    if (typeof File !== 'undefined') {
      audioFile = new File([file.buffer], filename, {
        type: file.mimetype,
      });
    } else {
      audioFile = new Blob([file.buffer], { type: file.mimetype });
      (audioFile as any).name = filename;
    }

    const uploadTime = Date.now() - startTime;

    const generation = trace?.generation({
      name: "whisper-transcription",
      model: "whisper-1",
      modelParameters: {
        language: "auto-detect",
        response_format: "json",
      },
      input: {
        filename: filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        qualityScore: qualityMetrics.qualityScore,
      },
    });

    const apiStartTime = Date.now();
    
    logger.debug(
      {
        filename: filename,
        mimetype: file.mimetype,
        fileSize: file.size,
        fileType: audioFile instanceof File ? "File" : "Blob",
      },
      "Sending file to OpenAI Whisper API (auto-detect language)",
    );
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile as any,
      model: "whisper-1",
      response_format: "json",
    });
    const apiProcessingTime = Date.now() - apiStartTime;

    const totalLatency = Date.now() - startTime;

    generation?.end({
      output: {
        transcript: transcription.text,
        language: (transcription as any).language || "auto-detected",
        transcriptLength: transcription.text.length,
      },
      usage: {
        total: Math.ceil(transcription.text.length / 4),
        unit: "TOKENS" as const,
      },
    });

    logger.debug(
      {
        transcriptLength: transcription.text.length,
        latency: totalLatency,
        qualityScore: qualityMetrics.qualityScore,
      },
      "Transcription completed",
    );

    transcriptionSpan?.update({
      metadata: {
        latency: {
          uploadTime,
          apiProcessingTime,
          totalLatency,
        },
        transcriptLength: transcription.text.length,
        language: (transcription as any).language || "auto-detected",
      },
    });

    return res.json({
      transcript: transcription.text,
      language: (transcription as any).language || "auto-detected",
      qualityScore: qualityMetrics.qualityScore,
      qualityLevel: qualityAssessment.level,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : undefined;
    
    const isFileFormatError = error?.error?.message?.includes("Invalid file format") || 
                              error?.message?.includes("Invalid file format");
    
    const openAIError = error?.error || error;
    const detailedMessage = openAIError?.message || errorMessage;

    logger.error(
      {
        error: errorMessage,
        openAIError: openAIError?.message,
        filename: req.file?.originalname,
        mimetype: req.file?.mimetype,
        isFileFormatError,
      },
      "Error transcribing audio",
    );

    transcriptionSpan?.update({
      level: "ERROR",
      metadata: {
        error: detailedMessage,
        errorType: isFileFormatError ? "INVALID_FILE_FORMAT" : "TRANSCRIPTION_ERROR",
        filename: req.file?.originalname,
        mimetype: req.file?.mimetype,
        errorDetails,
      },
    });

    trace?.update({
      metadata: { error: detailedMessage, errorType: isFileFormatError ? "INVALID_FILE_FORMAT" : "TRANSCRIPTION_ERROR" },
    });

    const statusCode = isFileFormatError ? 400 : 500;
    
    return res.status(statusCode).json({
      error: isFileFormatError ? "Invalid file format" : "Failed to transcribe audio",
      message: detailedMessage,
      supportedFormats: ["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"],
    });
  } finally {
    transcriptionSpan?.end();
  }
});

app.post(
  "/api/tts/stream",
  rateLimitMiddleware(ttsRateLimiter, "tts-stream"),
  inputValidationMiddleware(10000, "text"),
  async (req, res) => {
  const langfuse = getLangfuse();
  const { text, voice = "alloy", rate = 1.0 } = req.body;
  const traceId = req.headers["x-langfuse-trace-id"] as string | undefined;
  const sessionId = req.headers["x-session-id"] as string | undefined;

  const trace = traceId && langfuse
    ? langfuse.trace({ id: traceId, name: "text-to-speech-stream" })
    : langfuse?.trace({
        name: "text-to-speech-stream",
        metadata: { sessionId: sessionId || "unknown" },
      });

  const ttsSpan = trace?.span({
    name: "tts-streaming",
    metadata: {
      endpoint: "/api/tts/stream",
    },
  });

  const startTime = Date.now();

  try {
    if (!text || typeof text !== "string") {
      ttsSpan?.update({
        level: "ERROR",
        metadata: { error: "Text is required" },
      });
      trace?.update({ metadata: { error: "Text is required" } });
      return res.status(400).json({ error: "Text is required" });
    }

    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    if (!validVoices.includes(voice)) {
      ttsSpan?.update({
        level: "ERROR",
        metadata: { error: "Invalid voice", validVoices },
      });
      trace?.update({ metadata: { error: "Invalid voice" } });
      return res.status(400).json({ 
        error: "Invalid voice", 
        validVoices 
      });
    }

    const validatedRate = Math.max(0.25, Math.min(4.0, rate));

    logger.debug(
      {
        textLength: text.length,
        voice,
        rate: validatedRate,
      },
      "Generating streaming speech with OpenAI TTS",
    );

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");

    const generation = trace?.generation({
      name: "openai-tts-stream",
      model: "tts-1-hd",
      modelParameters: {
        voice,
        rate: validatedRate,
      },
      input: {
        textLength: text.length,
        textPreview: text.substring(0, 100),
      },
    });

    const apiStartTime = Date.now();

    const streamResponse = openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
      response_format: "mp3",
    }, {
      stream: true, // Enable streaming
    });

    let totalBytes = 0;
    const response = await streamResponse;
    if (response.body) {
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const buffer = Buffer.from(value);
        totalBytes += buffer.length;
        res.write(buffer);
      }
    }

    const apiProcessingTime = Date.now() - apiStartTime;
    const totalLatency = Date.now() - startTime;

    generation?.end({
      output: {
        audioSize: totalBytes,
        audioSizeKB: (totalBytes / 1024).toFixed(2),
        bytesPerChar: (totalBytes / text.length).toFixed(2),
      },
      usage: {
        total: Math.ceil(text.length / 4),
        unit: "TOKENS" as const,
      },
    });

    logger.debug(
      {
        audioSize: totalBytes,
        textLength: text.length,
        latency: totalLatency,
      },
      "Streaming TTS generation completed",
    );

    ttsSpan?.update({
      metadata: {
        latency: {
          apiProcessingTime,
          totalLatency,
        },
        audioMetrics: {
          audioSize: totalBytes,
          textLength: text.length,
        },
        voice,
        rate: validatedRate,
      },
    });

    res.end();
    return;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error({ error }, "Error generating streaming speech");

    ttsSpan?.update({
      level: "ERROR",
      metadata: {
        error: errorMessage,
        errorDetails,
      },
    });

    trace?.update({
      metadata: { error: errorMessage },
    });

    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to generate streaming speech",
        message: errorMessage,
      });
    }
    return;
  } finally {
    ttsSpan?.end();
  }
});

// Text-to-Speech endpoint (non-streaming, for backward compatibility)
app.post(
  "/api/tts",
  rateLimitMiddleware(ttsRateLimiter, "tts"),
  inputValidationMiddleware(10000, "text"),
  async (req, res) => {
  const langfuse = getLangfuse();
  const traceId = req.headers["x-langfuse-trace-id"] as string | undefined;
  const sessionId = req.headers["x-session-id"] as string | undefined;

  const trace = traceId && langfuse
    ? langfuse.trace({ id: traceId, name: "text-to-speech" })
    : langfuse?.trace({
        name: "text-to-speech",
        metadata: { sessionId: sessionId || "unknown" },
      });

  const ttsSpan = trace?.span({
    name: "tts-generation",
    metadata: {
      endpoint: "/api/tts",
    },
  });

  const startTime = Date.now();

  try {
    const { text, voice = "alloy", rate = 1.0 } = req.body;

    if (!text || typeof text !== "string") {
      ttsSpan?.update({
        level: "ERROR",
        metadata: { error: "Text is required" },
      });
      trace?.update({ metadata: { error: "Audio file is required" } });
      return res.status(400).json({ error: "Text is required" });
    }

    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    if (!validVoices.includes(voice)) {
      ttsSpan?.update({
        level: "ERROR",
        metadata: { error: "Invalid voice", validVoices },
      });
      trace?.update({ metadata: { error: "Audio file is required" } });
      return res.status(400).json({ 
        error: "Invalid voice", 
        validVoices 
      });
    }

    const validatedRate = Math.max(0.25, Math.min(4.0, rate));

    logger.debug(
      {
        textLength: text.length,
        voice,
        rate: validatedRate,
      },
      "Generating speech with OpenAI TTS",
    );

    const generation = trace?.generation({
      name: "openai-tts",
      model: "tts-1-hd",
      modelParameters: {
        voice,
        rate: validatedRate,
      },
      input: {
        textLength: text.length,
        textPreview: text.substring(0, 100),
      },
    });

    const apiStartTime = Date.now();

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
    });

    const apiProcessingTime = Date.now() - apiStartTime;

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    const totalLatency = Date.now() - startTime;

    const audioSize = buffer.length;
    const bytesPerChar = audioSize / text.length;
    const estimatedDuration = audioSize / 16000;

    generation?.end({
      output: {
        audioSize,
        audioSizeKB: (audioSize / 1024).toFixed(2),
        bytesPerChar: bytesPerChar.toFixed(2),
        estimatedDuration: estimatedDuration.toFixed(2),
      },
      usage: {
        total: Math.ceil(text.length / 4),
        unit: "TOKENS" as const,
      },
    });

    logger.debug(
      {
        audioSize: buffer.length,
        textLength: text.length,
        latency: totalLatency,
        bytesPerChar: bytesPerChar.toFixed(2),
      },
      "TTS generation completed",
    );

    ttsSpan?.update({
      metadata: {
        latency: {
          apiProcessingTime,
          totalLatency,
        },
        audioMetrics: {
          audioSize,
          textLength: text.length,
          bytesPerChar: bytesPerChar.toFixed(2),
          estimatedDuration: estimatedDuration.toFixed(2),
        },
        voice,
        rate: validatedRate,
      },
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=3600");

    return res.send(buffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error({ error }, "Error generating speech");

    ttsSpan?.update({
      level: "ERROR",
      metadata: {
        error: errorMessage,
        errorDetails,
      },
    });

    trace?.update({
      metadata: { error: errorMessage },
    });

    return res.status(500).json({
      error: "Failed to generate speech",
      message: errorMessage,
    });
  } finally {
    ttsSpan?.end();
  }
});

app.post(
  "/api/chat/stream",
  rateLimitMiddleware(chatRateLimiter, "chat-stream"),
  sessionValidationMiddleware,
  inputValidationMiddleware(5000, "message"),
  async (req, res) => {
  const langfuse = getLangfuse();
  const { message, sessionId = "default" } = req.body;
  const traceId = req.headers["x-langfuse-trace-id"] as string | undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const trace = traceId && langfuse
    ? langfuse.trace({ id: traceId, name: "conversation-turn-stream" })
    : langfuse?.trace({
        name: "conversation-turn-stream",
        metadata: { sessionId },
      });

  const chatSpan = trace?.span({
    name: "chat-streaming",
    metadata: {
      endpoint: "/api/chat/stream",
      sessionId,
      messageLength: message?.length || 0,
    },
  });

  const startTime = Date.now();

  try {
    if (!message || typeof message !== "string") {
      res.write(`data: ${JSON.stringify({ 
        type: "error", 
        error: "Message is required" 
      })}\n\n`);
      res.end();
      return;
    }

    const orchestrator = await getOrchestrator(sessionId);
    let finalResponse: OrchestratorResponse | null = null;

    finalResponse = await orchestrator.processMessageStream(
      message,
      (chunk) => {
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(data);
        
        if (typeof (res as any).flush === 'function') {
          try {
            (res as any).flush();
            setTimeout(() => {
              try {
                (res as any).flush();
              } catch (e) {
              }
            }, 0);
          } catch (e) {
          }
        }
        
        if (chunk.type === 'token' && chunk.content) {
          logger.debug({ 
            token: chunk.content.substring(0, 30),
            tokenLength: chunk.content.length 
          }, "Sent token chunk to client");
        }
      },
      trace || undefined
    );

    const totalLatency = Date.now() - startTime;

    res.write(`data: ${JSON.stringify({ 
      type: "done",
      finalText: finalResponse.response,
      agent: finalResponse.agent,
      orderCreated: finalResponse.orderCreated,
      orderId: finalResponse.orderId,
    })}\n\n`);

    trace?.update({
      metadata: {
        agent: finalResponse.agent,
        orderCreated: finalResponse.orderCreated,
        orderId: finalResponse.orderId,
        sourcesCount: finalResponse.sources?.length || 0,
        status: "OK",
      },
    });

    chatSpan?.end({
      metadata: {
        agent: finalResponse.agent,
        responseLength: finalResponse.response.length,
        latency: totalLatency,
      },
    });

    res.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error({ error, errorDetails }, "Error processing streaming chat message");

    res.write(`data: ${JSON.stringify({ 
      type: "error", 
      error: errorMessage,
      details: errorDetails 
    })}\n\n`);
    res.end();

    chatSpan?.update({
      level: "ERROR",
      metadata: {
        error: errorMessage,
        errorDetails,
      },
    });

    trace?.update({
      metadata: { error: errorMessage },
    });
  } finally {
    chatSpan?.end();
  }
});

app.post(
  "/api/chat",
  rateLimitMiddleware(chatRateLimiter, "chat"),
  sessionValidationMiddleware,
  inputValidationMiddleware(5000, "message"),
  async (req, res) => {
  const langfuse = getLangfuse();
  const { message, sessionId = "default" } = req.body;
  const traceId = req.headers["x-langfuse-trace-id"] as string | undefined;

  const trace = traceId && langfuse
    ? langfuse.trace({ id: traceId, name: "conversation-turn" })
    : langfuse?.trace({
        name: "conversation-turn",
        metadata: { sessionId },
      });

  const chatSpan = trace?.span({
    name: "chat-processing",
    metadata: {
      endpoint: "/api/chat",
      sessionId,
      messageLength: message?.length || 0,
    },
  });

  const startTime = Date.now();

  try {
    if (!message || typeof message !== "string") {
      chatSpan?.update({
        level: "ERROR",
        metadata: { error: "Message is required" },
      });
      trace?.update({ metadata: { error: "Message is required" } });
      return res.status(400).json({ error: "Message is required" });
    }

    logger.info({ message: message.substring(0, 100), sessionId }, "Processing chat message");
    
    const orchestrator = await getOrchestrator(sessionId);
    
    let response: OrchestratorResponse;
    try {
      response = await orchestrator.processMessage(message, trace || undefined);
      logger.debug({ agent: response.agent, responseLength: response.response.length }, "Message processed successfully");
    } catch (error) {
      logger.error({ error, message: message.substring(0, 100) }, "Error in orchestrator.processMessage");
      throw error;
    }

    const totalLatency = Date.now() - startTime;

    trace?.update({
      metadata: {
        agent: response.agent,
        orderCreated: response.orderCreated,
        orderId: response.orderId,
        sourcesCount: response.sources?.length || 0,
        status: "OK",
      },
    });

    chatSpan?.end({
      metadata: {
        agent: response.agent,
        responseLength: response.response.length,
        latency: totalLatency,
      },
    });

    return res.json({
      ...response,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : undefined;

    logger.error({ error }, "Error processing chat message");

    chatSpan?.update({
      level: "ERROR",
      metadata: {
        error: errorMessage,
        errorDetails,
      },
    });

    trace?.update({
      metadata: { error: errorMessage },
    });

    return res.status(500).json({
      error: "Failed to process message",
      message: errorMessage,
    });
  } finally {
    chatSpan?.end();
  }
});

app.get(
  "/api/chat/history/:sessionId",
  sessionValidationMiddleware,
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    const orchestrator = await getOrchestrator(sessionId);
    const history = orchestrator.getHistory();

    res.json({ history, sessionId });
  } catch (error) {
    logger.error({ error }, "Error getting chat history");
    res.status(500).json({
      error: "Failed to get chat history",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.delete(
  "/api/chat/history/:sessionId",
  sessionValidationMiddleware,
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    const orchestrator = await getOrchestrator(sessionId);
    orchestrator.clearHistory();

    res.json({ success: true, sessionId });
  } catch (error) {
    logger.error({ error }, "Error clearing chat history");
    res.status(500).json({
      error: "Failed to clear chat history",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/orders/:orderId", (req, res) => {
  try {
    const { orderId } = req.params;
    const db = createDatabase();
    const order = getOrderById(db, orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ order });
  } catch (error) {
    logger.error({ error }, "Error getting order");
    return res.status(500).json({
      error: "Failed to get order",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/orders", (_req, res) => {
  try {
    const db = createDatabase();
    const orders = getAllOrders(db);

    res.json({ orders });
  } catch (error) {
    logger.error({ error }, "Error getting orders");
    res.status(500).json({
      error: "Failed to get orders",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.patch("/api/orders/:orderId/cancel", (req, res) => {
  try {
    const { orderId } = req.params;
    const db = createDatabase();
    const cancelledOrder = cancelOrder(db, orderId);

    if (!cancelledOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ success: true, order: cancelledOrder });
  } catch (error) {
    logger.error({ error }, "Error cancelling order");
    return res.status(500).json({
      error: "Failed to cancel order",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.delete("/api/orders/:orderId", (req, res) => {
  try {
    const { orderId } = req.params;
    const db = createDatabase();
    const deleted = deleteOrder(db, orderId);

    if (!deleted) {
      return res.status(404).json({ error: "Order not found" });
    }

    return res.json({ success: true, orderId });
  } catch (error) {
    logger.error({ error }, "Error deleting order");
    return res.status(500).json({
      error: "Failed to delete order",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    "Server started successfully",
  );
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

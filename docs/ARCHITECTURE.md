# Architecture Documentation

This document provides a comprehensive overview of the AI Product Assistant architecture, covering all architectural decisions, design patterns, and implementation details.

> **Note**: For setup and running instructions, see [README.md](../README.md).

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Core Components](#core-components)
4. [RAG Implementation](#rag-implementation)
5. [Agent Orchestration](#agent-orchestration)
6. [Function Calling & Tool System](#function-calling--tool-system)
7. [Streaming Architecture](#streaming-architecture)
8. [Voice Conversation System](#voice-conversation-system)
9. [Multi-Language Support](#multi-language-support)
10. [Security & Guardrails](#security--guardrails)
11. [Data Management](#data-management)
12. [Database Design](#database-design)
13. [Product Context & Reference Resolution](#product-context--reference-resolution)
14. [Configuration Management](#configuration-management)
15. [Observability & Monitoring](#observability--monitoring)
16. [CI/CD & Development Tooling](#cicd--development-tooling)

---

## System Overview

The AI Product Assistant is a production-ready e-commerce chatbot that combines Retrieval-Augmented Generation (RAG) for product information retrieval with autonomous order processing using OpenAI Function Calling. The system intelligently switches between information retrieval and order processing modes based on conversation context.

### Features

- **Dual-Agent System**:
  - **RAG Agent**: Answers product questions using vector search over 90+ products
  - **Order Agent**: Processes orders autonomously using OpenAI Function Calling
  
- **Autonomous Agent Handoff**: Intelligently switches between information retrieval and order processing based on conversation context

- **Function Calling**: Implements OpenAI Function Calling with tools:
  - `search_products`: Search and retrieve product information
  - `prepare_order_confirmation`: Show order summary before creation
  - `create_order`: Extract order details from conversation and persist to database

- **Streaming Support**: 
  - **Text Streaming**: Real-time token-by-token response delivery using Server-Sent Events (SSE)
  - **Voice Streaming**: Chunked audio streaming for low-latency text-to-speech playback

- **Structured Data Validation**: Uses Zod (TypeScript equivalent of Pydantic) for robust data validation

- **Database Persistence**: SQLite database with proper schema, CRUD operations, and unique order IDs

- **Multi-Language Support**: Supports 40+ languages for both text and voice conversations

- **Voice Conversation**: Continuous voice conversations with speech-to-text and text-to-speech

- **Security**: Input/output validation, prompt injection detection, content moderation, rate limiting

- **Modern Tech Stack**:
  - Backend: TypeScript, Express, LangChain, ChromaDB
  - Frontend: React, TypeScript, Vite
  - Vector Store: ChromaDB with OpenAI embeddings

### High-Level Architecture

```
┌─────────────────┐
│   Frontend      │
│   (React/TS)    │
└────────┬────────┘
         │ HTTP/SSE
         │
┌────────▼──────────────────────────────────────┐
│      Backend API (Express/TS)                 │
│  ┌────────────────────────────────────────┐   │
│  │      Orchestrator                      │   │
│  │  ┌──────────────┐  ┌───────────────┐   │   │
│  │  │  RAG Agent   │  │ Order Agent   │   │   │
│  │  └──────┬───────┘  └───────┬───────┘   │   │
│  └─────────┼─────────────────────┼────────┘   │
│            │                     │            │
│  ┌─────────▼──────────┐  ┌──────▼─────────┐   │
│  │  Vector Store      │  │  Database      │   │
│  │  (ChromaDB)        │  │  (SQLite)      │   │
│  └────────────────────┘  └────────────────┘   │
└───────────────────────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns**: Clear boundaries between RAG retrieval, order processing, and orchestration
2. **Autonomous Decision Making**: Agents use Function Calling to autonomously select tools based on context
3. **Production Readiness**: Security, validation, error handling, and observability built-in
4. **Scalability**: Modular design allows independent scaling and optimization of components
5. **Type Safety**: Full TypeScript with Zod schema validation throughout

---

## Architecture Patterns

### 1. Dual-Agent Pattern

The system uses two specialized agents:

- **RAG Agent**: Handles product information queries using vector similarity search
- **Order Agent**: Processes orders using Function Calling with structured validation

**Rationale**: Separating concerns improves maintainability, allows independent optimization, and enables clear handoff logic.

### 2. Orchestrator Pattern

The Orchestrator acts as a central coordinator:
- Detects intent from conversation context
- Routes messages to appropriate agents
- Manages conversation history
- Handles streaming responses

**Implementation**: `backend/src/orchestrator/index.ts`

### 3. Function Calling Pattern

OpenAI Function Calling enables autonomous tool selection:
- Agent decides when to call tools based on conversation
- No manual keyword routing required
- Tools return structured data validated with Zod schemas

**Tools**:
- `search_products`: Search product catalog
- `prepare_order_confirmation`: Show order summary before creation
- `create_order`: Persist order to database

### 4. RAG (Retrieval-Augmented Generation) Pattern

RAG combines:
- **Retrieval**: Vector similarity search + BM25 keyword search (hybrid)
- **Augmentation**: Retrieved context injected into LLM prompts
- **Generation**: LLM generates answers based on retrieved context

**Benefits**:
- Accurate product information (no hallucination)
- Handles 90+ products without hardcoding
- Semantic understanding of queries

---

## Core Components

### Project Structure

```
ai-product-assistant/
├── backend/              # Backend TypeScript code
│   ├── src/
│   │   ├── agents/      # RAG Agent and Order Agent
│   │   ├── chains/      # LangChain RAG chain
│   │   ├── config/      # Configuration management
│   │   ├── database/    # SQLite schema and CRUD operations
│   │   ├── embeddings/  # Embedding providers
│   │   ├── llm/         # LLM providers
│   │   ├── loaders/     # Product data loaders
│   │   ├── models/      # Zod schemas (Product, Order)
│   │   ├── orchestrator/  # Agent handoff logic
│   │   ├── prompts/     # Prompt templates
│   │   ├── retrievers/  # Vector retrieval strategies
│   │   ├── security/    # Security middleware and guardrails
│   │   ├── splitters/   # Text chunking
│   │   ├── utils/       # Utility functions
│   │   ├── vector-stores/  # ChromaDB integration
│   │   └── index.ts     # Express API server
│   ├── scripts/
│   │   └── build-index.ts  # Vector store initialization script
│   └── tests/           # Test files
│       ├── audio/       # Audio transcription tests
│       │   ├── golden-test-cases.json
│       │   ├── samples/
│       │   └── test-wer.ts
│       ├── chatbot/     # Chatbot integration tests
│       └── unit/        # Unit tests
├── frontend/            # Frontend React/TypeScript code
│   └── src/
│       ├── App.tsx      # Main chat interface
│       ├── components/  # React components
│       └── hooks/       # Custom React hooks
├── shared/              # Shared code between frontend and backend
│   └── src/
│       └── constants/   # Shared constants (languages, etc.)
├── data/                # Product data files
│   └── products.json   # Product catalog
├── docs/                # Documentation files
├── docker-compose.yml   # ChromaDB setup
├── package.json         # Root package.json (workspace config)
└── README.md
```

### Backend Structure

```
backend/src/
├── agents/              # RAG and Order agents
│   ├── rag-agent.ts     # Product information retrieval
│   └── order-agent.ts   # Order processing with Function Calling
├── chains/              # LangChain RAG chains
│   └── rag-chain.ts     # RAG chain implementation
├── config/              # Configuration management
│   └── env.ts          # Environment variable validation
├── database/            # Database operations
│   ├── schema.ts        # SQLite schema
│   └── operations.ts    # CRUD operations
├── embeddings/          # Embedding providers
│   └── providers/
│       └── openai.ts   # OpenAI embeddings
├── llm/                 # LLM providers
│   └── providers/
│       └── openai.ts   # OpenAI LLM integration
├── loaders/             # Data loaders
│   ├── json-loader.ts  # JSON product loader
│   └── directory-loader.ts
├── models/              # Zod schemas
│   ├── order.ts        # Order validation schema
│   └── product.ts      # Product validation schema
├── orchestrator/        # Agent orchestration
│   ├── index.ts        # Main orchestrator
│   └── types.ts        # Type definitions
├── prompts/             # Prompt templates
│   └── rag.ts          # RAG prompt with history
├── retrievers/          # Retrieval strategies
│   ├── hybrid.ts       # Hybrid vector + BM25
│   ├── similarity.ts  # Vector similarity
│   └── mmr.ts          # Maximal Marginal Relevance
├── security/            # Security & guardrails
│   ├── guardrails.ts   # Input/output validation
│   ├── middleware.ts   # Express middleware
│   └── callbacks.ts   # LangChain callbacks
├── splitters/          # Text chunking
│   └── index.ts       # Recursive character splitter
├── utils/               # Utility functions
│   ├── product-context.ts  # Product list management
│   └── langfuse.ts     # Observability integration
└── vector-stores/       # Vector database integration
    └── chroma.ts       # ChromaDB integration
```

### Frontend Structure

```
frontend/src/
├── App.tsx                      # Main application component
├── components/
│   ├── VoiceInput.tsx          # Speech-to-text input
│   ├── VoiceOutput.tsx         # Text-to-speech output
│   └── VoiceSettings.tsx       # Language/voice settings
└── hooks/
    ├── useStreamingChat.ts     # Streaming chat hook
    ├── useStreamingTTS.ts      # Streaming TTS hook
    ├── useContinuousVoiceConversation.ts  # Voice conversation
    └── useNaturalTTS.ts        # Natural TTS integration
```

---

## RAG Implementation

### Vector Store Setup

**Technology**: ChromaDB (with in-memory fallback)

**Embedding Model**: OpenAI `text-embedding-3-small`
- 1536-dimensional vectors
- Optimized for semantic similarity
- Cost-effective for production use

**Initialization Process**:
1. Load products from `data/products.json`
2. Chunk products using `RecursiveCharacterTextSplitter`
3. Generate embeddings for each chunk
4. Store in ChromaDB with metadata

**Configuration**:
- `CHUNK_SIZE`: 800 characters (default)
- `CHUNK_OVERLAP`: 100 characters (default)
- `MIN_CHUNK_SIZE`: 50 characters (prevents tiny chunks)

### Hybrid Retrieval Strategy

The system uses **hybrid search** combining:

1. **Vector Similarity Search** (50% weight)
   - Semantic understanding
   - Handles synonyms and related concepts
   - Example: "laptop" matches "notebook computer"

2. **BM25 Keyword Search** (50% weight)
   - Exact keyword matching
   - Handles specific product names
   - Example: "iPhone 15 Pro" exact match

**Implementation**: `backend/src/retrievers/hybrid.ts`

**Rationale**: Hybrid search combines semantic understanding with exact matching, improving retrieval accuracy for both conceptual queries ("cheap laptops") and specific queries ("iPhone 15 Pro").

**Retrieval Configuration**:
- `TOP_K`: 5 documents retrieved (default)
- `SCORE_THRESHOLD`: 0.5 minimum similarity score
- `RETRIEVER_TYPE`: `hybrid` (can be `similarity` or `mmr`)

### RAG Chain Architecture

```
User Question
    ↓
[Retriever] → Hybrid Search (Vector + BM25)
    ↓
Retrieved Documents (Top K)
    ↓
[Prompt Template] → Inject context + history
    ↓
[LLM] → Generate answer
    ↓
Response with Sources
```

**Prompt Engineering**:
- System prompt includes language detection rules
- Context injection with retrieved documents
- Conversation history for multi-turn context
- Reference resolution instructions (see Product Context section)

**Implementation**: `backend/src/chains/rag-chain.ts`

### Prompting Techniques

The system employs several advanced prompting techniques to ensure accurate, context-aware responses:

#### 1. Chain-of-Thought (CoT) Prompting

**Technique**: Explicit step-by-step reasoning instructions

**Usage**: Reference resolution in RAG Agent prompts

**Example**:
```
STEP 1: ANALYZE THE CURRENT QUESTION
STEP 2: EXAMINE CONVERSATION HISTORY
STEP 3: RESOLVE REFERENCES (if present)
STEP 4: CONSTRUCT THE ANSWER
STEP 5: VERIFY YOUR ANSWER
```

**Why**: CoT prompting improves accuracy for complex reasoning tasks like resolving ambiguous references ("the second one"). By breaking down the process into explicit steps, the LLM follows a structured reasoning path rather than making intuitive leaps.

**Implementation**: `backend/src/prompts/rag.ts` → Reference resolution process

#### 2. Few-Shot Examples

**Technique**: Providing concrete examples of desired behavior

**Usage**: Reference resolution examples showing different reference types

**Examples Included**:
- Ordinal references ("the second one")
- Demonstrative references ("it", "this one")
- Descriptive references ("the cheaper one")
- Product name references (partial names)
- Confirmation questions ("Are you sure?")

**Why**: Few-shot examples help the LLM understand the expected output format and reasoning pattern. They serve as templates for handling similar cases, reducing errors in edge cases.

**Implementation**: `backend/src/prompts/rag.ts` → "EXAMPLES OF REFERENCE RESOLUTION" section

#### 3. Priority/Emphasis Techniques

**Technique**: Using keywords like "CRITICAL", "HIGHEST PRIORITY", "IMPORTANT" to emphasize rules

**Usage**: Language detection rules, order flow instructions

**Example**:
```
CRITICAL LANGUAGE RULE - HIGHEST PRIORITY (READ THIS FIRST):
You MUST respond in the EXACT same language that the user uses...
```

**Why**: LLMs process prompts sequentially and can be influenced by emphasis. Critical rules placed at the top with strong language ensure they're prioritized over other instructions, preventing common failures like language mismatches.

**Implementation**: Both RAG and Order Agent prompts use this technique

#### 4. Structured Instructions with Numbered Steps

**Technique**: Breaking complex processes into numbered, sequential steps

**Usage**: Order processing flow, reference resolution

**Example**:
```
STEP 1: Collect all required information
STEP 2: Use prepare_order_confirmation tool
STEP 3: Ask user to confirm
STEP 4: Use create_order tool
```

**Why**: Numbered steps create a clear execution order, preventing the LLM from skipping steps or executing them out of sequence. This is crucial for multi-step processes like order creation where order matters.

**Implementation**: Order Agent prompt → "IMPORTANT ORDER FLOW" section

#### 5. Categorized Rules

**Technique**: Organizing instructions into categories (A, B, C, D, E)

**Usage**: Different types of reference resolution

**Example**:
```
A. ORDINAL REFERENCES ("first", "second"...)
B. DEMONSTRATIVE REFERENCES ("this", "that"...)
C. DESCRIPTIVE REFERENCES ("cheaper one"...)
```

**Why**: Categorization helps the LLM quickly identify which rule set applies to the current situation, improving accuracy and reducing confusion when multiple patterns could match.

**Implementation**: RAG prompt → Reference resolution categories

#### 6. Context Injection (RAG Pattern)

**Technique**: Injecting retrieved context directly into the prompt

**Usage**: Product information retrieval

**Format**:
```
Context:
{retrieved_documents}

Question: {user_question}

Answer:
```

**Why**: Direct context injection ensures the LLM has access to accurate, up-to-date information from the vector store. This prevents hallucination and ensures responses are grounded in actual product data.

**Implementation**: `backend/src/chains/rag-chain.ts` → Context formatting

#### 7. Conversation History Integration

**Technique**: Using `MessagesPlaceholder` to inject full conversation history

**Usage**: Multi-turn conversations, context awareness

**Why**: Including conversation history allows the LLM to:
- Maintain context across multiple turns
- Resolve references to previous messages
- Extract information mentioned earlier (e.g., order details)
- Provide coherent, context-aware responses

**Implementation**: `backend/src/prompts/rag.ts` → `MessagesPlaceholder("chat_history")`

#### 8. Explicit Constraints and Boundaries

**Technique**: Clearly stating what NOT to do

**Usage**: Preventing common failure modes

**Examples**:
- "DO NOT search the context when user references previous message"
- "NEVER call create_order immediately after collecting information"
- "DO NOT use a different language even if previous conversation was in another language"

**Why**: Explicit negative instructions help prevent common errors. LLMs sometimes need explicit boundaries to avoid unintended behaviors, especially when multiple valid interpretations exist.

**Implementation**: Both RAG and Order Agent prompts include explicit "DO NOT" rules

#### 9. Progressive Information Disclosure

**Technique**: Instructing the agent to provide minimal information first, then expand on request

**Usage**: Product search results presentation

**Example**:
```
IMPORTANT: When presenting product search results, do NOT immediately list all specifications.
- Briefly mention product name(s) and price(s)
- Ask if customer wants more details
- Only provide detailed specifications when explicitly asked
```

**Why**: This technique improves user experience by:
- Reducing information overload
- Making conversations more natural
- Allowing users to guide the depth of information
- Preventing overly verbose responses

**Implementation**: RAG prompt → "IMPORTANT PRESENTATION GUIDELINES"

#### 10. Role Definition and Persona

**Technique**: Explicitly defining the agent's role and responsibilities

**Usage**: Both agents have clear role definitions

**Example**:
```
You are a helpful product assistant for an e-commerce store.
You are an order processing assistant. Your job is to:
1. Search for products when users ask about them
2. Collect invoice information before creating orders
3. Create orders when users confirm...
```

**Why**: Clear role definition helps the LLM:
- Stay in character
- Focus on relevant tasks
- Avoid scope creep
- Provide consistent responses aligned with the role

**Implementation**: Both RAG and Order Agent system prompts

### Prompt Design Rationale

**Why These Techniques Work Together**:

1. **Layering**: Multiple techniques are layered (CoT + Few-shot + Constraints) to reinforce desired behavior
2. **Redundancy**: Critical rules are repeated in different forms to ensure they're followed
3. **Examples Over Rules**: Examples often work better than abstract rules for complex behaviors
4. **Explicit Over Implicit**: Explicit instructions reduce ambiguity and improve consistency
5. **Context-Aware**: Prompts adapt based on conversation history and retrieved context

**Trade-offs**:
- **Longer Prompts**: More detailed prompts increase token usage but improve accuracy
- **Maintenance**: Complex prompts require careful updates when requirements change
- **Model Dependency**: Some techniques work better with certain models (e.g., CoT works well with GPT-4)

**Implementation**: `backend/src/prompts/rag.ts`, `backend/src/agents/order-agent.ts`

---

## Agent Orchestration

### Intent Detection

The Orchestrator detects order intent using keyword matching and confirmation patterns:

**Order Keywords**:
- "buy", "purchase", "order", "place order"
- "checkout", "i'll take", "confirm"
- "yes, please", "proceed", "complete purchase"

**Confirmation Patterns**:
- Recent history contains "yes", "confirm", "proceed"
- User explicitly confirms after product discussion

**Implementation**: `backend/src/orchestrator/index.ts` → `detectOrderIntent()`

### Agent Handoff Flow

```
User Message
    ↓
Orchestrator (Intent Detection)
    ↓
    ├─→ Product Query? → RAG Agent
    │                        ↓
    │                    Vector Store
    │                        ↓
    │                    Product Info
    │
    └─→ Order Intent? → Order Agent
                             ↓
                       Function Calling
                             ↓
                       ┌─────┴─────┐
                       │           │
               search_products  create_order
                       │           │
                       ↓           ↓
               Product Search  Database
```

### Conversation History Management

- Stored in-memory per session (Map<sessionId, Orchestrator>)
- Format: `Array<{role: "user" | "assistant", content: string, timestamp?: string}>`
- Includes metadata: product lists, agent type, sources
- Used for context-aware responses and reference resolution

---

## Function Calling & Tool System

### Tool Definitions

#### 1. `search_products`

**Purpose**: Search product catalog by name, category, or description

**Schema**:
```typescript
{
  query: string  // Search query
}
```

**Implementation**: Searches `data/products.json` with case-insensitive matching

**Returns**: JSON string with `found: boolean` and `products: Product[]`

#### 2. `prepare_order_confirmation`

**Purpose**: Prepare order summary before creation (shows user complete order details)

**Schema**:
```typescript
{
  items: OrderItem[],
  customer_name: string,
  billing_address: string,  // REQUIRED
  invoice_email: string,   // REQUIRED
  customer_email?: string,
  customer_phone?: string,
  shipping_address?: string
}
```

**Implementation**: Validates required fields, calculates totals, formats summary

**Returns**: Formatted order confirmation string

#### 3. `create_order`

**Purpose**: Persist order to database after user confirmation

**Schema**:
```typescript
{
  items: OrderItem[],
  customer_name: string,
  billing_address: string,  // REQUIRED
  invoice_email: string,   // REQUIRED
  customer_email?: string,
  customer_phone?: string,
  shipping_address?: string
}
```

**Implementation**: 
- Validates with Zod schema
- Generates unique order ID
- Persists to SQLite database
- Returns order confirmation

**Order Flow**:
1. User expresses order intent
2. Order Agent collects required information (customer name, billing address, invoice email)
3. Agent calls `prepare_order_confirmation` to show summary
4. User confirms ("yes", "proceed", etc.)
5. Agent calls `create_order` to persist order

**Implementation**: `backend/src/agents/order-agent.ts`

### Autonomous Tool Selection

The Order Agent autonomously decides when to call tools:
- **Product questions** → `search_products`
- **Order confirmation needed** → `prepare_order_confirmation`
- **User confirmed order** → `create_order`

No manual routing required - LLM analyzes conversation context and selects appropriate tools.

---

## Streaming Architecture

### Text Streaming (Server-Sent Events)

**Endpoint**: `POST /api/chat/stream`

**Protocol**: Server-Sent Events (SSE)

**Flow**:
```
User Message
    ↓
Orchestrator.processMessageStream()
    ↓
Agent.stream() → LLM Stream
    ↓
Token Callback → SSE Event
    ↓
Frontend: useStreamingChat hook
    ↓
Real-time UI Updates
```

**Event Format**:
```
data: {"type":"token","content":"The iPhone 15 Pro"}
data: {"type":"token","content":" is priced at $999"}
data: {"type":"metadata","agent":"rag","sources":[...]}
data: {"type":"done","finalText":"..."}
```

**Benefits**:
- Low perceived latency (first token appears quickly)
- Better user experience (progressive rendering)
- Real-time feedback

**Implementation**: 
- Backend: `backend/src/index.ts` → `/api/chat/stream`
- Frontend: `frontend/src/hooks/useStreamingChat.ts`

### Voice Streaming (Chunked Audio)

**Endpoint**: `POST /api/tts/stream`

**Protocol**: HTTP Chunked Transfer Encoding

**Flow**:
```
Text Response
    ↓
OpenAI TTS API (streaming)
    ↓
Audio Chunks (MP3)
    ↓
HTTP Chunked Response
    ↓
Frontend: useStreamingTTS hook
    ↓
Audio Queue → Playback
```

**Audio Format**: MP3 (`audio/mpeg`)

**Headers**:
```
Content-Type: audio/mpeg
Transfer-Encoding: chunked
Cache-Control: no-cache
```

**Frontend Implementation**:
- Chunks queued in `audioQueueRef`
- Sequential playback using Web Audio API
- Low-latency audio streaming (starts playing before full generation)

**Benefits**:
- Reduced time-to-first-audio
- Better voice conversation experience
- Efficient bandwidth usage

**Implementation**:
- Backend: `backend/src/index.ts` → `/api/tts/stream`
- Frontend: `frontend/src/hooks/useStreamingTTS.ts`

---

## Voice Conversation System

### Continuous Voice Conversation

The system supports **continuous voice conversations** where:
1. User speaks → Speech-to-Text (Whisper API)
2. System processes → Chat response
3. System speaks → Text-to-Speech (OpenAI TTS)
4. Loop continues automatically

**Features**:
- **VAD (Voice Activity Detection)**: Detects when user stops speaking
- **Noise Detection**: Filters background noise
- **Auto-playback**: Automatically plays TTS after response
- **Interruption Handling**: Can interrupt TTS to start new conversation

**Implementation**: `frontend/src/hooks/useContinuousVoiceConversation.ts`

### Speech-to-Text (STT)

**API**: OpenAI Whisper API

**Endpoint**: `POST /api/transcribe`

**Supported Formats**:
- WebM, WAV, MP3, MP4, M4A, OGG, FLAC, MPGA

**Features**:
- Multi-language support (40+ languages)
- Automatic language detection
- Audio quality assessment
- File size validation (max 25MB)

**Audio Quality Metrics**:
- Quality score calculation
- SNR (Signal-to-Noise Ratio) estimation
- RMS (Root Mean Square) analysis
- File size and format validation

**Implementation**: `backend/src/index.ts` → `/api/transcribe`

### Text-to-Speech (TTS)

**API**: OpenAI TTS API

**Models**: `tts-1-hd` (high quality)

**Voices**: alloy, echo, fable, onyx, nova, shimmer

**Features**:
- Streaming support (chunked audio)
- Rate control (0.25x - 4.0x)
- Natural voice synthesis
- Low latency

**Endpoints**:
- `POST /api/tts` - Non-streaming (backward compatibility)
- `POST /api/tts/stream` - Streaming (recommended)

**Implementation**: 
- Backend: `backend/src/index.ts` → `/api/tts` and `/api/tts/stream`
- Frontend: `frontend/src/hooks/useStreamingTTS.ts`

---

## Multi-Language Support

### Language Detection & Response

**Supported Languages**: 40+ languages (see `shared/src/constants/languages.ts`)

**Language Handling Strategy**:
1. **UI Language Selection** (Primary): When user selects language in UI, system responds ONLY in that language
2. **Automatic Detection** (Fallback): If no UI language is set, system detects language from user's current question
3. **Conversation History**: Used for context, but language preference takes priority

**Priority Order**:
- **If UI language is set**: Always respond in the selected language, regardless of user's message language
- **If UI language is not set**: Detect language from user's current question and respond in that language

**Implementation**:
- Prompts include language detection instructions
- Both RAG and Order agents respect language settings
- Language passed through orchestrator to agents

**Prompt Engineering**:
```
CRITICAL LANGUAGE RULE - HIGHEST PRIORITY:
You MUST respond in the EXACT same language that the user uses in their CURRENT question.
- Analyze the user's CURRENT question to detect its language
- Respond ONLY in that detected language
- The user's current question language takes priority over any conversation history
```

**Voice Support**:
- STT: Whisper API supports 40+ languages (auto-detect or explicit)
- TTS: OpenAI TTS supports multiple languages (varies by voice)
- Language setting in UI controls both STT and TTS

**Implementation**:
- Prompts: `backend/src/prompts/rag.ts`
- Agents: `backend/src/agents/rag-agent.ts`, `backend/src/agents/order-agent.ts`
- Frontend: `frontend/src/components/VoiceSettings.tsx`

---

## Security & Guardrails

### Input Validation

**Middleware**: `inputValidationMiddleware`

**Checks**:
- Maximum length validation (configurable, default 5000 chars)
- Type validation (string required)
- Prompt injection detection
- Input sanitization

**Implementation**: `backend/src/security/middleware.ts`

### Prompt Injection Detection

**Patterns Detected**:
- "ignore previous instructions"
- "forget all prompts"
- "you are now a..."
- "system: respond..."
- "[system]" tags
- "override system"
- "jailbreak" attempts
- "roleplay" attempts

**Response**: Logged as warning, but not blocked (guardrails handle at LLM level)

**Implementation**: `backend/src/security/guardrails.ts` → `detectPromptInjection()`

### Output Validation

**Checks**:
- Maximum length (default 10000 chars)
- Null byte detection
- Control character validation
- Content moderation (OpenAI Moderation API)

**Implementation**: `backend/src/security/guardrails.ts` → `validateOutput()`

### Content Moderation

**API**: OpenAI Moderation API

**Categories Checked**:
- Hate, harassment, violence
- Self-harm, sexual content
- Spam, illegal activity

**Response**: If flagged, returns safe default message instead of LLM output

**Implementation**: `backend/src/security/guardrails.ts` → `moderateContent()`

### Rate Limiting

**Endpoints Protected**:
- `/api/chat` - Chat rate limiter
- `/api/chat/stream` - Chat rate limiter
- `/api/tts` - TTS rate limiter
- `/api/tts/stream` - TTS rate limiter
- `/api/transcribe` - Transcription rate limiter

**Implementation**: `backend/src/security/middleware.ts` → Rate limiters

### Security Headers

**Middleware**: `securityHeadersMiddleware`

**Headers Set**:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (in production)

**Implementation**: `backend/src/security/middleware.ts`

### Request Size Limits

- **JSON Body**: 10MB limit
- **File Upload**: 25MB limit (audio files)
- **Input Fields**: Configurable per endpoint

**Implementation**: `backend/src/security/middleware.ts` → `requestSizeLimitMiddleware`

### Guardrails Callback Handler

**LangChain Integration**: `GuardrailsCallbackHandler`

**Features**:
- Validates LLM outputs in real-time
- Applies content moderation
- Logs security events
- Prevents unsafe content from being returned

**Implementation**: `backend/src/security/callbacks.ts`

---

## Data Management

### Product Data Format

**Location**: `data/products.json`

**Schema**:
```typescript
{
  product_id: string,        // Unique identifier (e.g., "PROD-001")
  name: string,              // Product name
  description: string,       // Detailed description
  price: number,            // Price (e.g., 999)
  category: string,         // Category (e.g., "Electronics")
  sub_category: string,     // Sub-category (e.g., "Smart Phone", "Laptop")
  stock_status: "in_stock" | "out_of_stock" | "low_stock",
  specifications?: {         // Optional specifications
    [key: string]: string
  }
}
```

**Loading**: `backend/src/loaders/json-loader.ts`

**Vector Store Update**:
1. Edit `data/products.json`
2. Run `npm run dev:build-index`
3. New products available for queries

### Chunking Strategy

**Algorithm**: Recursive Character Text Splitter

**Configuration**:
- `CHUNK_SIZE`: 800 characters
- `CHUNK_OVERLAP`: 100 characters
- `MIN_CHUNK_SIZE`: 50 characters

**Separators** (in order):
1. `\n\n` (paragraph breaks)
2. `\n` (line breaks)
3. `. ` (sentences)
4. `! ` (exclamations)
5. `? ` (questions)
6. ` ` (spaces)

**Rationale**: Preserves semantic meaning while ensuring chunks fit embedding model limits.

**Implementation**: `backend/src/splitters/index.ts`

---

## Database Design

### Schema

**Database**: SQLite (file-based, ACID compliant)

**Table**: `orders`

```sql
CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,           -- Format: ORD-XXXXXX-XXXXXX
  items TEXT NOT NULL,                 -- JSON array of order items
  total_price REAL NOT NULL,
  customer_name TEXT NOT NULL,         -- REQUIRED
  customer_email TEXT,
  customer_phone TEXT,
  shipping_address TEXT,
  billing_address TEXT,                -- REQUIRED (for invoice)
  invoice_email TEXT,                  -- REQUIRED (for invoice)
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_orders_created_at` - For time-based queries
- `idx_orders_status` - For status filtering

**Order ID Format**: `ORD-XXXXXX-XXXXXX` (12-character random alphanumeric)

**Status Values**:
- `pending` - Order created, awaiting processing
- `confirmed` - Order confirmed
- `processing` - Order being processed
- `shipped` - Order shipped
- `delivered` - Order delivered
- `cancelled` - Order cancelled

### CRUD Operations

**Create**: `createOrder(db, orderData)` - Validates with Zod, generates ID, inserts

**Read**: 
- `getOrderById(db, orderId)` - Get single order
- `getAllOrders(db)` - Get all orders

**Update**: 
- `cancelOrder(db, orderId)` - Update status to 'cancelled'

**Delete**: `deleteOrder(db, orderId)` - Remove order

**Implementation**: `backend/src/database/operations.ts`

### Data Validation

**Schema**: Zod schema (`OrderSchema`)

**Validation Rules**:
- `order_id`: Required, min length 1
- `items`: Array, min 1 item, each item validated
- `total_price`: Must match sum of item prices (within 0.01 tolerance)
- `customer_name`: Required, min length 1
- `billing_address`: Required, min length 1
- `invoice_email`: Required, valid email format
- `status`: Enum validation

**Business Logic**:
- Total price calculated from items
- Validates total matches provided total (prevents tampering)
- Required fields enforced at schema level

**Implementation**: `backend/src/models/order.ts` → `validateOrder()`

---

## Product Context & Reference Resolution

### Product List Indexing

When the RAG Agent returns multiple products, they are indexed with positions:

```typescript
interface ProductListItem {
  position: number;        // 1-indexed (1, 2, 3, ...)
  product_id: string;
  name: string;
  price: number;
  category: string;
  stock_status: string;
  specifications?: Record<string, string>;
}
```

**Storage**: Stored in chat message metadata

**Usage**: Enables reference resolution ("the second one", "number 2", etc.)

### Reference Resolution

**Supported Reference Types**:

1. **Ordinal References**:
   - "the first one", "second", "third", "last"
   - "number 1", "number 2", "1st", "2nd"

2. **Demonstrative References**:
   - "this one", "that one", "it"

3. **Descriptive References**:
   - "the cheaper one", "the more expensive one"
   - "the Android one", "the Pro model"

**Resolution Process**:
1. Detect reference in user question
2. Extract latest product list from conversation history
3. Map reference to specific product
4. Rewrite question with explicit product name
5. Process rewritten question

**Example**:
```
User: "Tell me about laptops"
Assistant: "1) MacBook Pro - $1999, 2) Dell XPS 15 - $1499"
User: "How much is the second one?"
System: Resolves "second one" → "Dell XPS 15"
Response: "The second one, the Dell XPS 15, is priced at $1499."
```

**Implementation**: 
- `backend/src/utils/product-context.ts` → `ProductContextManager`
- `backend/src/agents/rag-agent.ts` → Reference resolution before retrieval

### Prompt Engineering for References

The RAG prompt includes detailed instructions for reference resolution:

- Step-by-step reasoning process
- Examples of different reference types
- Priority: Conversation history over retrieved context
- Clarification requests for ambiguous references

**Implementation**: `backend/src/prompts/rag.ts` → Reference resolution instructions

---

## Configuration Management

### Environment Variables

**Validation**: Zod schema validation (`ConfigSchema`)

**Required**:
- `OPENAI_API_KEY` - OpenAI API key

**Optional (with defaults)**:
- `LLM_MODEL` - LLM model (default: `gpt-4o-mini`)
- `EMBEDDING_MODEL` - Embedding model (default: `text-embedding-3-small`)
- `VECTOR_STORE_TYPE` - `chromadb` or `memory` (default: `chromadb`)
- `CHROMA_HOST` - ChromaDB host (default: `localhost`)
- `CHROMA_PORT` - ChromaDB port (default: `8000`)
- `DATABASE_PATH` - SQLite path (default: `./data/orders.db`)
- `CHUNK_SIZE` - Text chunk size (default: `800`)
- `CHUNK_OVERLAP` - Chunk overlap (default: `100`)
- `MIN_CHUNK_SIZE` - Minimum chunk size (default: `50`)
- `RETRIEVER_TYPE` - `similarity`, `mmr`, or `hybrid` (default: `hybrid`)
- `TOP_K` - Documents to retrieve (default: `5`)
- `SCORE_THRESHOLD` - Minimum similarity score (default: `0.5`)
- `PORT` - Backend port (default: `3001`)
- `CORS_ORIGIN` - Frontend URL (default: `http://localhost:5173`)
- `LOG_LEVEL` - Log level (default: `info`)
- `NODE_ENV` - Environment (default: `development`)

**Langfuse (Observability)**:
- `LANGFUSE_ENABLED` - Enable Langfuse (default: `false`)
- `LANGFUSE_EVALUATION_ENABLED` - Enable Langfuse evaluation (default: `false`)
- `LANGFUSE_SECRET_KEY` - Langfuse secret key
- `LANGFUSE_PUBLIC_KEY` - Langfuse public key
- `LANGFUSE_BASE_URL` - Langfuse base URL

**ChromaDB (Additional)**:
- `CHROMA_SSL` - Enable SSL for ChromaDB connection (default: `false`)
- `CHROMA_API_KEY` - ChromaDB API key (optional)

**Implementation**: `backend/src/config/env.ts`

### Configuration Access

**Pattern**: Singleton with lazy initialization

```typescript
const config = getConfig();  // Validated, typed config
```

**Benefits**:
- Type-safe configuration
- Validation at startup
- Single source of truth
- Environment-specific defaults

---

## Observability & Monitoring

### Langfuse Integration

**Purpose**: LLM observability and tracing

**Features**:
- Request/response tracing
- Token usage tracking
- Latency monitoring
- Error tracking
- Custom metadata

**Implementation**: 
- `backend/src/utils/langfuse.ts` - Langfuse client
- Integrated in orchestrator, agents, and API endpoints

### Structured Logging

**Logger**: Pino-based structured logger

**Log Levels**: `debug`, `info`, `warn`, `error`

**Structured Fields**:
- Session IDs
- Agent types
- Request metadata
- Error details
- Performance metrics

**Implementation**: `backend/src/logger.ts`

### Metrics Tracked

- **Latency**: Request processing time, API call duration
- **Token Usage**: Input/output tokens per request
- **Agent Selection**: Which agent handled request
- **Order Creation**: Order IDs, order status
- **Retrieval**: Number of sources retrieved, retrieval scores
- **Audio Quality**: Quality scores for audio inputs

### Golden Test Cases & Evaluation

**Purpose**: Automated evaluation of audio transcription accuracy using Word Error Rate (WER)

**Golden Test Cases**:
- Predefined test cases with expected transcripts
- Audio samples covering different scenarios
- Category-based evaluation with different thresholds

**Test Case Categories**:
- **clean-speech**: Clear, high-quality audio samples (WER threshold: 5%)
- **domain-jargon**: Product names and technical terms (WER threshold: 8%)
- **critical-scenarios**: Order placement and critical phrases (WER threshold: 5%)

**Evaluation Process**:
1. Load golden test cases from `tests/audio/golden-test-cases.json`
2. Transcribe audio files using production API
3. Calculate WER (Word Error Rate) comparing actual vs expected transcripts
4. Evaluate against category-specific thresholds
5. Generate evaluation reports with pass/fail status
6. Upload results to Langfuse dataset (if enabled)

**WER Calculation**:
- Measures transcription accuracy by comparing expected vs actual transcripts
- Accounts for substitutions, insertions, and deletions
- Formula: `WER = (S + D + I) / N` where:
  - S = substitutions
  - D = deletions
  - I = insertions
  - N = total words in expected transcript

**Langfuse Integration**:
- Test cases uploaded to Langfuse dataset
- Evaluation scores tracked per test case
- Metrics: WER, accuracy, pass/fail status
- Category-based aggregation and reporting

**Implementation**:
- `backend/src/utils/langfuseDataset.ts` - Golden test case evaluation
- `backend/src/utils/wer.ts` - Word Error Rate calculation
- `backend/tests/audio/test-wer.ts` - WER evaluation script
- `backend/tests/audio/golden-test-cases.json` - Test case definitions

**Usage**:
```bash
# Run WER evaluation
npm run test:wer  # (if script exists)
# Or directly:
node backend/tests/audio/test-wer.ts
```

---

## CI/CD & Development Tooling

### GitHub Actions CI/CD

The project uses GitHub Actions for continuous integration and code quality checks.

#### Build Workflow (`.github/workflows/build.yml`)

**Triggers**: Push and pull requests to `main` branch

**Steps**:
1. Checkout code
2. Setup Node.js 22.x with npm cache
3. Install dependencies (`npm ci`)
4. Run type check (`npm run typecheck`)
5. Run build (`npm run build`)

**Purpose**: Ensures code compiles and type checks pass before merging

#### Code Quality Workflow (`.github/workflows/code-quality.yml`)

**Triggers**: Push and pull requests to `main` branch

**Steps**:
1. Checkout code
2. Setup Node.js 22.x with npm cache
3. Install dependencies (`npm ci`)
4. Run type check (`npm run typecheck`)
5. Run lint (`npm run lint`)
6. Check formatting (`npm run format:check`)

**Purpose**: Enforces code quality standards (linting, formatting) before code is merged

**Benefits**:
- Catches type errors early
- Enforces consistent code style
- Prevents broken builds from being merged
- Provides feedback on pull requests

### Git Hooks (Husky)

The project uses Husky to run checks before commits and pushes.

#### Pre-commit Hook (`.husky/pre-commit`)

**Checks Performed**:
1. **.env File Protection**: Prevents committing `.env` files (security)
2. **Lint Check**: Runs ESLint to catch code quality issues
3. **Format Check**: Verifies code formatting with Prettier
4. **Build Check**: Ensures code compiles successfully

**Purpose**: Prevents committing code that:
- Contains sensitive information (.env files)
- Has linting errors
- Is improperly formatted
- Fails to build

**Benefits**:
- Prevents security issues (no .env files in git)
- Maintains code quality before commits
- Catches errors before they reach CI/CD
- Faster feedback loop (runs locally)

#### Pre-push Hook (`.husky/pre-push`)

**Checks Performed**:
- Runs test suite (`npm test`)

**Purpose**: Ensures all tests pass before code is pushed to remote

**Benefits**:
- Prevents pushing broken code
- Ensures test coverage before sharing code
- Catches regressions early

### Development Workflow

**Typical Flow**:
1. Developer makes changes
2. Pre-commit hook runs (lint, format, build, .env check)
3. If checks pass, commit succeeds
4. Developer pushes to remote
5. Pre-push hook runs (tests)
6. If tests pass, push succeeds
7. GitHub Actions workflows run (build, code quality)
8. Pull request can be merged if all checks pass

**Rationale**: Multi-layer validation ensures:
- Local development catches issues early
- CI/CD provides additional safety net
- Consistent code quality across team
- Security best practices enforced

**Implementation**:
- Husky configuration: `.husky/pre-commit`, `.husky/pre-push`
- GitHub Actions: `.github/workflows/build.yml`, `.github/workflows/code-quality.yml`
- Package.json: `prepare` script sets up Husky hooks

---

## System Flow

### High-Level Flow

```
User Message
    ↓
Orchestrator (Intent Detection)
    ↓
    ├─→ Product Query? → RAG Agent → Vector Store → Product Info
    │
    └─→ Order Intent? → Order Agent → Function Calling
                             ↓
                       ┌─────┴─────┐
                       │           │
               search_products  create_order
                       │           │
                       ↓           ↓
               Product Search  Database Persistence
```

### Component Responsibilities

1. **RAG Agent** (`backend/src/agents/rag-agent.ts`):
   - Uses vector similarity search to find relevant products
   - Retrieves 2-5 relevant product chunks per query
   - Answers questions with specific prices and stock status
   - Handles product list indexing and reference resolution

2. **Order Agent** (`backend/src/agents/order-agent.ts`):
   - Implements OpenAI Function Calling with tools
   - Extracts order details from multi-turn conversation
   - Validates data using Zod schemas
   - Persists orders to SQLite database

3. **Orchestrator** (`backend/src/orchestrator/index.ts`):
   - Detects order intent from conversation context
   - Routes to appropriate agent
   - Manages conversation history
   - Handles streaming responses

4. **Database** (`backend/src/database/`):
   - SQLite with proper schema
   - Unique order IDs (format: `ORD-XXXXXX-XXXXXX`)
   - CRUD operations with parameterized queries

## API Endpoints

### Chat Endpoints

#### POST `/api/chat`
Send a chat message and get a response (non-streaming).

**Request:**
```json
{
  "message": "What's the price of iPhone 15 Pro?",
  "sessionId": "session-123",
  "language": "en"
}
```

**Response:**
```json
{
  "response": "The iPhone 15 Pro is priced at $999...",
  "agent": "rag",
  "sources": [...],
  "sessionId": "session-123",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### POST `/api/chat/stream`
Stream chat response using Server-Sent Events (SSE).

**Request:**
```json
{
  "message": "What's the price of iPhone 15 Pro?",
  "sessionId": "session-123",
  "language": "en"
}
```

**Response:** `text/event-stream`
```
data: {"type":"token","content":"The iPhone 15 Pro"}
data: {"type":"token","content":" is priced at $999"}
data: {"type":"metadata","agent":"rag","sources":[...]}
data: {"type":"done","finalText":"The iPhone 15 Pro is priced at $999..."}
```

#### GET `/api/chat/history/:sessionId`
Get conversation history for a session.

#### DELETE `/api/chat/history/:sessionId`
Clear conversation history for a session.

### Text-to-Speech Endpoints

#### POST `/api/tts`
Generate speech from text (non-streaming).

**Request:**
```json
{
  "text": "Hello, this is a test",
  "voice": "alloy",
  "rate": 1.0
}
```

**Response:** `audio/mpeg` (MP3 audio file)

#### POST `/api/tts/stream`
Stream TTS audio chunks as they're generated.

**Request:**
```json
{
  "text": "Hello, this is a test",
  "voice": "alloy",
  "rate": 1.0
}
```

**Response:** `audio/mpeg` with `Transfer-Encoding: chunked`

**Supported Voices**: alloy, echo, fable, onyx, nova, shimmer

### Speech-to-Text Endpoint

#### POST `/api/transcribe`
Transcribe audio to text using Whisper API.

**Request:** `multipart/form-data`
- `audio`: Audio file (WebM, WAV, MP3, MP4, M4A, OGG, FLAC, MPGA)
- `language`: Optional language code (auto-detect if not provided)

**Response:**
```json
{
  "transcript": "What's the price of iPhone 15 Pro?",
  "language": "en",
  "qualityScore": 0.85,
  "qualityLevel": "good"
}
```

### Order Endpoints

#### GET `/api/orders/:orderId`
Get order details by ID.

#### GET `/api/orders`
Get all orders.

#### PATCH `/api/orders/:orderId/cancel`
Cancel an order (update status to 'cancelled').

#### DELETE `/api/orders/:orderId`
Delete an order.

### Health Endpoints

#### GET `/health`
Health check endpoint.

#### GET `/api/tts/health`
TTS service health check.

## Usage Examples

### Product Query
```
User: "What's the price of the iPhone 15 Pro?"
Assistant: "The iPhone 15 Pro is priced at $999 and we have it in stock..."
```

### Multi-turn Conversation
```
User: "Tell me about laptops"
Assistant: [Lists laptops with prices]
User: "I'll take the MacBook Pro"
Assistant: "Perfect! Your order has been confirmed. Order ID: ORD-ABC123-456789..."
```

### Reference Resolution
```
User: "Show me Android phones"
Assistant: "1) Samsung Galaxy S24 Ultra - $1199, 2) Google Pixel 9 Pro - $999"
User: "How much is the second one?"
Assistant: "The second one, the Google Pixel 9 Pro, is priced at $999."
```

### Order Processing
The Order Agent extracts:
- Product names and IDs from conversation
- Quantities (e.g., "I'll take 2")
- Prices from product search
- Customer information if provided
- Billing address and invoice email (required)

## Product Data Management

Products are stored in `data/products.json` as a JSON array. Each product must include:
- `product_id`: Unique identifier (e.g., "PROD-001")
- `name`: Product name
- `description`: Detailed product description
- `price`: Price as a number (e.g., 999)
- `category`: Product category (e.g., "Electronics")
- `stock_status`: One of "in_stock", "out_of_stock", or "low_stock"
- `specifications`: (Optional) Object with additional product specs

**Example Product Entry:**
```json
{
  "product_id": "PROD-001",
  "name": "iPhone 15 Pro",
  "description": "Latest iPhone with A17 Pro chip...",
  "price": 999,
  "category": "Electronics",
  "stock_status": "in_stock",
  "specifications": {
    "storage": "128GB",
    "color": "Natural Titanium"
  }
}
```

**To add/update products:**
1. Edit `data/products.json`
2. Rebuild the vector index: `npm run dev:build-index`
3. The new products will be available for queries

**Note**: The vector store must be rebuilt after any product changes for the updates to be searchable.

## Technical Decisions Summary

### Why RAG for Products?

RAG ensures accurate product information by retrieving actual data from vector store rather than relying on LLM knowledge. This prevents hallucination of prices, availability, and specifications. With 90+ products, RAG scales better than hardcoding responses. The system retrieves 2-5 relevant product chunks per query using semantic similarity search (k-NN), which is more effective than simple keyword matching. Vector embeddings (using OpenAI's text-embedding-3-small) capture semantic meaning, so queries like "show me phones" will retrieve all smartphone products even if the exact word "phone" isn't in every product description.

### Why Function Calling?

OpenAI Function Calling enables autonomous tool selection based on conversation context, eliminating manual keyword routing. The Order Agent decides when to search for products or create orders based purely on conversation analysis. This creates a more natural conversation flow and reduces maintenance burden.

### Why Two Agents Instead of One?

Separating RAG (information retrieval) from Order (transaction processing) improves:
- **Maintainability**: Clear responsibilities
- **Performance**: Independent optimization
- **Scalability**: Can scale agents separately
- **Security**: Order agent has stricter validation

### How Does Handoff Work?

The Orchestrator analyzes conversation context to detect order intent:
- Keywords: "buy", "purchase", "order", "confirm", etc.
- Confirmation patterns: "yes", "I'll take it", etc.
- Routes to Order Agent when intent detected
- Otherwise uses RAG Agent for product queries

### Why Hybrid Search?

Combining vector similarity (semantic) with BM25 (keyword) search improves retrieval accuracy for both conceptual queries ("cheap laptops") and specific queries ("iPhone 15 Pro"). The hybrid approach uses 50% weight for vector search and 50% for BM25, combining semantic understanding with exact matching.

### Why SQLite?

SQLite provides:
- Zero-configuration database
- File-based persistence (survives restarts)
- ACID compliance
- Easy migration path to PostgreSQL/MySQL
- Suitable for single-server deployments

### Why Streaming?

Streaming improves perceived latency:
- **Text Streaming**: First token appears quickly (SSE)
- **Voice Streaming**: Audio playback starts before full generation (chunked transfer)
- Better user experience with progressive rendering

### Why Zod for Validation?

Zod provides:
- Type-safe schemas
- Runtime validation
- TypeScript integration
- Custom validation logic
- Clear error messages
- Prevents invalid data from reaching database

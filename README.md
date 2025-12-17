# AI Product Assistant

AI-powered e-commerce chatbot that combines RAG (Retrieval-Augmented Generation) for product information retrieval with autonomous order processing using function calling. Built with LangChain, TypeScript, React, and modern AI orchestration patterns.

## ✅ Features

> For detailed architectural information and implementation details, see [Architecture Documentation](./docs/ARCHITECTURE.md).

| Feature | Implementation |  |
|--------|----------------|--------|
| **Dual-Agent System** | RAG Agent (product queries) + Order Agent (order processing) with autonomous handoff | ✅ |
| **Vector Store** | ChromaDB with ≥90 products, OpenAI embeddings (text-embedding-3-small), hybrid retrieval | ✅ |
| **Product Database** | ≥90 products with product_id, name, description, price, category, stock_status | ✅ |
| **RAG Retrieval** | Retrieves 2-5 relevant chunks per query, answers include specific prices from documents | ✅ |
| **Hybrid Search** | Combines vector similarity (semantic) + BM25 (keyword) search for improved accuracy | ✅ |
| **Function Calling** | 3 tools: `search_products`, `prepare_order_confirmation`, `create_order` | ✅ |
| **Autonomous Tool Selection** | Agent decides tool usage based on conversation context (no manual routing) | ✅ |
| **Order Extraction** | Extracts product, quantity, price, customer info from multi-turn chat history | ✅ |
| **Product Reference Resolution** | Handles ordinal references ("the second one"), demonstrative ("this one"), descriptive ("cheaper one") | ✅ |
| **Structured Validation** | Zod schemas (TypeScript equivalent of Pydantic) with field constraints (gt, min_length, etc.) | ✅ |
| **Database Persistence** | SQLite with proper schema, unique order IDs, CRUD operations, survives restarts | ✅ |
| **Multi-turn Conversations** | Chat history management, context-aware responses, reference resolution | ✅ |
| **Text Streaming** | Server-Sent Events (SSE) for real-time token-by-token response delivery | ✅ |
| **Voice Streaming** | Chunked audio streaming for low-latency text-to-speech playback | ✅ |
| **Speech-to-Text** | OpenAI Whisper API with 40+ language support, auto-detection, quality assessment | ✅ |
| **Text-to-Speech** | OpenAI TTS API with 6 voices, rate control, streaming support | ✅ |
| **Continuous Voice Conversation** | Automatic STT → processing → TTS loop with VAD and noise detection | ✅ |
| **Multi-language Support** | 40+ languages for both text and voice conversations with auto-detection | ✅ |
| **Input Validation** | Maximum length checks, type validation, input sanitization, configurable limits | ✅ |
| **Prompt Injection Detection** | Pattern-based detection for jailbreak attempts, system prompt overrides, roleplay | ✅ |
| **Output Validation** | Maximum length checks, null byte detection, control character validation | ✅ |
| **Content Moderation** | OpenAI Moderation API integration for hate, harassment, violence, self-harm detection | ✅ |
| **Rate Limiting** | Per-endpoint rate limiters (chat, TTS, transcription) with configurable windows | ✅ |
| **Security Headers** | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS | ✅ |
| **Request Size Limits** | JSON body (10MB), configurable per endpoint | ✅ |
| **Guardrails Callback Handler** | LangChain integration for real-time LLM output validation and moderation | ✅ |
| **Langfuse Observability** | LLM tracing, token usage tracking, latency monitoring, error tracking, custom metadata | ✅ |
| **Golden Test Cases** | Audio transcription evaluation with WER (Word Error Rate) calculation, category-based thresholds, Langfuse integration | ✅ |
| **Structured Logging** | Pino-based logging with session IDs, agent types, request metadata, performance metrics | ✅ |
| **Session Management** | In-memory session storage with conversation history per session ID | ✅ |
| **Error Handling** | Comprehensive try-catch blocks, graceful error messages, fallback mechanisms | ✅ |
| **Audio Quality Assessment** | Quality scoring, SNR estimation, RMS analysis for audio inputs | ✅ |
| **GitHub Actions CI/CD** | Automated build and code quality checks on push/PR (type check, lint, format, build) | ✅ |
| **Git Hooks (Husky)** | Pre-commit hooks (lint, format check, build, .env file protection) and pre-push hooks (tests) | ✅ |
| **Documentation** | Comprehensive README and architecture documentation | ✅ |

## 📋 Prerequisites

- **Node.js** 22+ (check with `node --version`)
- **OpenAI API Key** - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Docker** (optional) - For running ChromaDB. If you don't have Docker, you can use the in-memory vector store instead.

## 🛠️ Setup

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd ai-product-assistant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   
   This installs dependencies for both backend and frontend workspaces automatically.

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` with your configuration:**
   ```env
   OPENAI_API_KEY=your-api-key-here
   ```
   
   See `.env.example` for all available configuration options.

5. **Start ChromaDB (using Docker Compose):**
   ```bash
   docker-compose up -d
   ```
   
   Verify ChromaDB is running:
   ```bash
   curl http://localhost:8000/api/v2/heartbeat
   ```
   
   **Alternative:** Use in-memory vector store (no Docker required):
   ```bash
   # Set in .env
   VECTOR_STORE_TYPE=memory
   ```
   
   Note: In-memory store doesn't persist between restarts.

6. **Build the vector index:**
   ```bash
   npm run dev:build-index
   ```
   
   This loads products from `data/`, generates embeddings, and stores them in the vector store.

## 🚀 Running the Application

### Development Mode

Run both backend and frontend concurrently:

```bash
npm run dev
```

> **Note:** If `npm run dev` doesn't work (especially on Windows), run backend and frontend separately using `npm run dev:backend` and `npm run dev:frontend` in different terminals.

This starts:
- **Backend API server** on `http://localhost:3001`
- **Frontend development server** on `http://localhost:5173`

Open `http://localhost:5173` in your browser to use the application.

**Run backend only:**
```bash
npm run dev:backend
```

**Run frontend only:**
```bash
npm run dev:frontend
```

### Production Build

Build both backend and frontend:

```bash
npm run build
```

**Build backend only:**
```bash
npm run build:backend
```

**Build frontend only:**
```bash
npm run build:frontend
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run backend and frontend in development mode |
| `npm run dev:backend` | Run backend only in development mode |
| `npm run dev:frontend` | Run frontend only in development mode |
| `npm run dev:build-index` | Build vector store index from products |
| `npm run build` | Build both backend and frontend for production |
| `npm run build:backend` | Build backend only |
| `npm run build:frontend` | Build frontend only |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint code |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run typecheck` | Type check TypeScript code |

## 🔧 Configuration

All configuration is done via environment variables in `.env`. See `.env.example` for all available options.

**Required:**
- `OPENAI_API_KEY` - Your OpenAI API key

**Common Optional Variables:**
- `LLM_MODEL` - LLM model (default: `gpt-4o-mini`)
- `EMBEDDING_MODEL` - Embedding model (default: `text-embedding-3-small`)
- `VECTOR_STORE_TYPE` - `chromadb` or `memory` (default: `chromadb`)
- `DATABASE_PATH` - SQLite database path (default: `./data/orders.db`)
- `PORT` - Backend server port (default: `3001`)
- `CORS_ORIGIN` - Frontend URL (default: `http://localhost:5173`)

## 🧪 Testing

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run end-to-end tests:
```bash
npm run test:e2e
```

## 🚨 Troubleshooting

**`npm run dev` Not Working (especially on Windows):**
- If `npm run dev` fails or doesn't start both servers, try running backend and frontend separately in different terminal windows:
  ```bash
  # Terminal 1 - Backend
  npm run dev:backend
  
  # Terminal 2 - Frontend
  npm run dev:frontend
  ```
- This is a common issue on Windows due to how `concurrently` handles process management

**ChromaDB Connection Issues:**
- Verify ChromaDB is running: `curl http://localhost:8000/api/v2/heartbeat`
- Or use in-memory store: `VECTOR_STORE_TYPE=memory` in `.env`

**OpenAI API Errors:**
- Verify `OPENAI_API_KEY` is set correctly in `.env`
- Check API rate limits on OpenAI dashboard

**Vector Store Not Found:**
- Run `npm run dev:build-index` to initialize the vector store

**Database Errors:**
- Ensure `data/` directory exists
- Check file permissions for database file

**Port Already in Use:**
- Change `PORT` in `.env` if port 3001 is already in use
- Change frontend port in `frontend/vite.config.ts` if port 5173 is in use

## 📚 Documentation

- [Architecture Documentation](./docs/ARCHITECTURE.md) - Comprehensive architectural decisions, design patterns, and technical details

## 📄 License

MIT

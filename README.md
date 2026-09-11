# WiseAI Outbound Voice Decision Tree System

A production-grade, enterprise conversational AI decision graph and outbound call simulation platform. The system combines an interactive node-based visual workflow editor (React Flow), an autonomous LLM turn orchestrator (FastAPI), real-time low-latency Text-to-Speech (TTS) streaming via OmniVoice WebSocket, and hands-free Automatic Speech Recognition (ASR) with client-side Voice Activity Detection (VAD).

---

## 1. System Architecture Overview

The platform consists of three core components:

1. **Frontend (`decision-graph/`)**:
   - Built with React 19, TypeScript, and Vite.
   - Interactive visual flow canvas for configuring outbound campaigns, greeting prompts, qualification questions, objection handling, and hangup dispositions.
   - Built-in live phone call simulator featuring real-time audio waveform indicators, word-by-word streaming transcriptions, dual-language switching (English and Nepali), and hands-free microphone voice interaction.
   - High-performance Web Audio API PCM streaming queue player for immediate, zero-gap speech playback.

2. **Backend (`backend/`)**:
   - Built with Python 3.12, FastAPI, and Uvicorn.
   - Autonomous turn orchestrator and intent-routing engine powered by WiseAI LLM endpoints.
   - Grounded knowledge retrieval engine for handling out-of-turn customer questions and objections.
   - Full-duplex WebSocket TTS relay that streams 16-bit PCM audio chunks from OmniVoice (`/stream_from_text`) directly to the browser.
   - Multipart audio ingestion service for speech transcription (`/transcribe-from-stream`).

3. **Persistence Layer (`docker-compose.yml`)**:
   - PostgreSQL 16 container managing campaign metadata, flow graphs, node schemas, and call disposition histories.
   - Built-in SQLite local fallback for offline development.

---

## 2. Audio Pipeline: Streaming TTS and ASR Architecture

### Text-to-Speech (TTS) Streaming
- **Protocol**: WebSocket (`wss://` / `ws://`) streaming raw uncompressed 16-bit linear PCM at 24,000 Hz.
- **Provider**: OmniVoice Flow-Matching TTS engine (`/stream_from_text`).
- **Mechanism**:
  - The client sends synthesis requests over WebSocket (`/api/call/ws-tts`).
  - The backend opens a low-latency connection to the OmniVoice streaming service.
  - The engine generates audio in chunked bursts of approximately 200 milliseconds.
  - The frontend Web Audio API player (`PCMStreamPlayer`) immediately schedules the first chunk upon arrival (Time-To-First-Chunk ~500ms to 2.0s), allowing speech playback to start before the full sentence is generated.
  - Supports instant barge-in: when the user begins speaking or cancels the turn, the active audio buffer sources and WebSocket streams are aborted immediately.
  - Automatic HTTP fallback: if the WebSocket service is unreachable, the system automatically falls back to synchronous HTTP audio generation (`/generate_from_text`).

### Automatic Speech Recognition (ASR)
- **Protocol**: HTTP Multipart/Form-Data.
- **Provider**: WiseAI ASR engine (`/transcribe-from-stream`).
- **Mechanism**:
  - Client-side Voice Activity Detection (VAD) monitors microphone input volume and RMS energy levels in real time.
  - Detects when the caller starts and stops speaking (with configurable silence thresholds).
  - Encodes the speech into 16kHz PCM WAV format and posts it to `/api/call/asr`.
  - The backend forwards the audio stream to WiseAI ASR and returns the transcribed text to advance the call turn.

### Note on WebRTC
This platform does not use WebRTC (UDP/RTP, SIP signaling, or STUN/TURN media servers). Instead, it uses a TCP-based WebSocket stream paired with the browser Web Audio API. This design provides comparable sub-second latency while eliminating NAT traversal issues, firewall blocks, and complex telephony infrastructure.

---

## 3. Directory Structure

```
wiseai-call/
├── docker-compose.yml              # PostgreSQL container configuration
├── README.md                       # Master system documentation
├── backend/
│   ├── .env                        # Local environment configuration
│   ├── .env.example                # Template environment file
│   ├── requirements.txt            # Python dependencies
│   ├── main.py                     # FastAPI application entrypoint
│   ├── config.py                   # Pydantic settings and environment loader
│   ├── schemas.py                  # Pydantic request and response schemas
│   ├── routers/
│   │   ├── call_router.py          # Turn processing, TTS WebSocket, and ASR endpoints
│   │   ├── campaign_router.py      # Campaign management and graph persistence
│   │   ├── template_router.py      # Predefined outbound call templates
│   │   └── llm_router.py           # Direct LLM completions proxy
│   ├── services/
│   │   ├── tts_service.py          # OmniVoice WebSocket and HTTP TTS client
│   │   ├── asr_service.py          # WiseAI ASR multipart client
│   │   ├── turn_orchestrator.py    # LLM decision routing and knowledge grounded engine
│   │   └── campaign_store.py       # PostgreSQL and SQLite storage backend
│   └── tests/                      # Automated unit and integration tests
└── decision-graph/
    ├── package.json                # Frontend dependencies and scripts
    ├── vite.config.ts              # Vite bundler and reverse proxy configuration
    ├── index.html                  # Main HTML entrypoint
    └── src/
        ├── components/
        │   ├── canvas/             # React Flow node canvas and custom graph nodes
        │   ├── call/               # Voice Call Simulator interface and controls
        │   └── campaign/           # Campaign configuration and lead profiling
        ├── utils/
        │   ├── speech.ts           # Web Audio API PCM stream player and audio synthesis
        │   └── vadRecorder.ts      # Voice Activity Detection and microphone recorder
        └── types/                  # TypeScript domain models and graph definitions
```

---

## 4. Prerequisites

Ensure the following tools are installed on your host system:

- **Docker & Docker Compose**: Required for running the local PostgreSQL service.
- **Python 3.10, 3.11, or 3.12**: Required for the FastAPI backend.
- **Node.js 18+ or 20+ (with npm)**: Required for the React Vite frontend.
- **Audio Input / Output**: A working microphone and speaker setup for testing call audio.

---

## 5. Environment Configuration

### Backend Configuration (`backend/.env`)

Copy the example file to `.env`:

```bash
cd backend
cp .env.example .env
```

Verify that `backend/.env` contains the correct values:

```ini
# Server Network Configuration
HOST=127.0.0.1
PORT=8000

# WiseAI Base Host
WISEAI_BASE_URL=https://dev-models.wiseai.wiseyak.com

# WiseAI LLM Intent Router
LLM_API_URL=https://dev-models.wiseai.wiseyak.com/v1/chat/completions
LLM_TIMEOUT=60.0
ENABLE_THINKING=false

# WiseAI ASR (Speech-to-Text)
ASR_API_URL=https://dev-asr.wiseai.wiseyak.com/transcribe-from-stream
ASR_TIMEOUT=30.0
ASR_LANGUAGE=eng

# WiseAI TTS (OmniVoice Speech-to-Text)
TTS_API_URL=https://dev-tts.wiseai.wiseyak.com/generate_from_text
TTS_WS_URL=wss://dev-tts.wiseai.wiseyak.com/stream_from_text
TTS_STREAMING_ENABLED=true
TTS_TIMEOUT=45.0
TTS_DEFAULT_VOICE=Prensa

# Campaign Persistence Store (PostgreSQL)
CAMPAIGN_STORE_BACKEND=postgres
DATABASE_URL=postgresql://wiseai:wiseai_local_dev@127.0.0.1:5433/wiseai_campaigns
```

*Note: If running a local OmniVoice instance, update `TTS_WS_URL` to `ws://localhost:8071/stream_from_text`.*

---

## 6. Step-by-Step Installation and Execution

### Step 1: Start the PostgreSQL Database Container

Open a terminal at the project root directory and run:

```bash
docker compose up -d
```

Verify that the container is running:

```bash
docker ps --filter "name=wiseai-campaign-postgres"
```

The database will be available at `127.0.0.1:5433` with database name `wiseai_campaigns`.

---

### Step 2: Set Up and Start the Python Backend

Open a new terminal and navigate to the `backend/` directory:

```bash
cd backend
```

#### On Windows (PowerShell):

1. Create a virtual environment if one does not already exist:
   ```powershell
   python -m venv .venv
   ```

2. Activate the virtual environment:
   ```powershell
   .venv\Scripts\Activate.ps1
   ```
   *If script execution is blocked, run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`*

3. Install required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

4. Launch the FastAPI server:
   ```powershell
   uvicorn main:app --reload --port 8000
   ```

#### On Linux / macOS:

1. Create and activate virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Launch server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

The backend health check will be accessible at: `http://127.0.0.1:8000/api/health`

---

### Step 3: Set Up and Start the Frontend Application

Open a third terminal and navigate to the `decision-graph/` directory:

```bash
cd decision-graph
```

1. Install Node.js packages:
   ```bash
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

The application will be accessible in your web browser at:
`http://localhost:5173` (or `http://127.0.0.1:5173`)

Vite automatically proxies all `/api` and WebSocket `/api/call/ws-tts` requests to the FastAPI backend running on port 8000.

---

## 7. How to Test the Outbound Voice Call Flow

1. Open `http://localhost:5173` in Google Chrome, Microsoft Edge, or Mozilla Firefox.
2. In the top navigation bar, select an existing campaign template (such as "ISP Upgrade Outreach") or create custom decision nodes on the visual canvas.
3. Click the **"Simulate Voice Call"** button in the header.
4. On the Call Simulator screen:
   - Ensure the language selector is set to your desired language (English or Nepali).
   - Click **"Start Outbound Call"**.
   - You will hear a simulated telephone ring tone, followed by call connect signaling.
   - The AI agent will begin speaking the opening prompt using OmniVoice streaming TTS.
   - Enable your microphone using the microphone button or type simulated lead responses in the bottom input bar.
   - Observe real-time intent classification, knowledge graph traversal, and word-by-word streaming responses.

---

## 8. API Reference

### Health Check
- `GET /api/health`
  - Returns backend status and current LLM connectivity configuration.

### Call Simulation and Voice
- `POST /api/call/process-turn`
  - Processes a customer response against the decision graph and returns the next node, reasoning, and grounded response text.
- `POST /api/call/asr`
  - Multipart form upload accepting `file` (WAV/MP4 audio) and `language` (`eng` or `nep`). Returns transcribed text.
- `POST /api/call/tts`
  - Synchronous HTTP endpoint accepting JSON `{ text, voice_id, language, speed }`. Returns Base64 WAV audio.
- `GET /api/call/tts-stream` / `POST /api/call/tts-stream`
  - Chunked HTTP streaming endpoint yielding raw 16-bit PCM bytes.
- `WebSocket /api/call/ws-tts`
  - Bidirectional WebSocket for real-time PCM streaming. Client sends JSON payload; server streams PCM audio chunks.

### Campaign and Templates
- `GET /api/campaigns`
  - Lists all persisted campaigns from PostgreSQL.
- `POST /api/campaigns`
  - Saves or updates graph nodes, edges, lead profiles, and knowledge configurations.
- `GET /api/templates`
  - Returns predefined outbound call workflows (e.g., ISP retention, appointment booking).

---

## 9. Troubleshooting

### Problem: `ModuleNotFoundError: No module named 'pydantic_settings'`
- **Cause**: Uvicorn was launched using global Python instead of the virtual environment.
- **Solution**: Activate the virtual environment before starting Uvicorn:
  - Windows: `.venv\Scripts\Activate.ps1`
  - Direct execution: `.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000`

### Problem: ASR or TTS returns 404 Not Found
- **Cause**: Legacy URL prefixes (`/asr/` or `/tts/`) present in `backend/.env`.
- **Solution**: Confirm that `backend/.env` has:
  - `ASR_API_URL=https://dev-asr.wiseai.wiseyak.com/transcribe-from-stream`
  - `TTS_API_URL=https://dev-tts.wiseai.wiseyak.com/generate_from_text`
  - `TTS_WS_URL=wss://dev-tts.wiseai.wiseyak.com/stream_from_text`

### Problem: Database Connection Error on Startup
- **Cause**: PostgreSQL Docker container is stopped or port 5433 is in use.
- **Solution**: Run `docker compose ps` to ensure the container is running. Restart with `docker compose restart`.

### Problem: Microphone VAD Not Detecting Speech
- **Cause**: Browser microphone permissions are blocked.
- **Solution**: Click the camera/microphone icon in your browser address bar and grant access to `localhost:5173`.

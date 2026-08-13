# Zoom Clone — Full-Stack Scalable Video Conferencing Platform

A functional, high-performance web application clone of Zoom, built with Next.js 14, Python FastAPI, and Node.js mediasoup (SFU).

---

## 🌟 Key Architecture & Features

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 14 App Router + Tailwind CSS)            │
│  - REST calls → FastAPI (Meetings, Participants, CRUD)      │
│  - WebSocket  → FastAPI (Real-time Presence Channel)         │
│  - Socket.io  → mediasoup SFU (WebRTC Transports & Tracks)  │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
       ┌───────▼──────┐          ┌────────▼────────┐
       │  FastAPI      │          │  Node.js        │
       │  Python 3.12  │          │  mediasoup SFU  │
       │  SQLite +     │          │  Workers Pool   │
       │  SQLAlchemy   │          │  Routers        │
       │  Redis Cache  │          │  Transports     │
       │  TokenBucket  │          │  Producers      │
       │  Rate Limiter │          │  Consumers      │
       └───────────────┘          └─────────────────┘
```

- **Next.js 14 App Router**: Modern UI with Zoom design system, instant & scheduled meeting flows, pre-join lobby with camera/mic preview, responsive dynamic video grid.
- **FastAPI (Python)**: REST API backing meetings, participants, host controls (Mute All / Remove), and WebSocket presence channel.
- **Node.js mediasoup (SFU)**: Multi-participant Selective Forwarding Unit creating 1 Router per meeting and 2 WebRTC Transports (Send + Recv) per participant.
- **Redis Caching**: Cache-aside layer for meeting details and participant lists.
- **Token Bucket Rate Limiting**: Custom Redis-backed token bucket middleware guarding API endpoints against request bursts.
- **Base62 Short URLs**: Cryptographically generated 64-bit random integers encoded into base62 formatted short meeting codes (`XXX-XXXX-XXX`).

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- Redis server running locally on `localhost:6379` (Optional — falls back to in-memory caching/rate-limiting automatically)

---

### 1. Python FastAPI Backend Setup

```bash
cd backend

# Create & activate virtualenv
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run server (initialises DB & seeds sample data automatically)
uvicorn app.main:app --reload --port 8000
```
- REST API: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`

---

### 2. Node.js mediasoup SFU Service Setup

```bash
cd mediasoup-service

# Install dependencies
npm install

# Start service
npm start
```
- SFU Server: `http://localhost:4000`

---

### 3. Next.js Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```
- Web Application: `http://localhost:3000`

---

## 📡 API Reference & Endpoints

| Method | Endpoint | Description | Cache Strategy |
|---|---|---|---|
| `POST` | `/api/meetings/instant` | Create instant meeting | Invalidates upcoming cache |
| `POST` | `/api/meetings/schedule` | Create scheduled meeting | Invalidates upcoming cache |
| `GET` | `/api/meetings/upcoming` | List upcoming scheduled meetings | Redis 30s TTL |
| `GET` | `/api/meetings/recent` | List past meeting history | Redis 30s TTL |
| `GET` | `/api/meetings/{code}` | Get meeting details | Redis 60s TTL |
| `POST` | `/api/meetings/{code}/join` | Add participant to meeting | Invalidates participant cache |
| `POST` | `/api/meetings/{code}/leave` | Remove participant on exit | Invalidates participant cache |
| `GET` | `/api/meetings/{code}/participants` | List active room participants | Redis 10s TTL |
| `POST` | `/api/meetings/{code}/mute-all` | Host control: mute all participants | Invalidates cache |
| `POST` | `/api/meetings/{code}/remove/{id}` | Host control: kick participant | Invalidates cache |
| `WS` | `/ws/meetings/{code}` | Real-time presence channel | Real-time broadcast |

---

## 🔒 Token Bucket Rate Limiting

Rate limiting is enforced by `RateLimitMiddleware` in FastAPI:
- **Meeting Creation**: 5 burst capacity, refills at 1 token / 10s
- **Meeting Read**: 30 burst capacity, refills at 1 token / 1s
- **Participant Actions**: 10 burst capacity, refills at 1 token / 5s
- **Host Controls**: 10 burst capacity, refills at 1 token / 3s
- **Headers**: Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` on `429 Too Many Requests`.

---

## 🌐 Network & Deployment Notes

### mediasoup Port Requirements
mediasoup requires UDP/TCP port range (default `10000–10100`) open for WebRTC RTP media traffic.
- **Recommended Host**: Fly.io, AWS EC2, DigitalOcean Droplet, or VPS.
- **Environment Variables**:
  - `ANNOUNCED_IP`: Set to your server's public IPv4 address on production.
  - `LISTEN_IP`: Set to `0.0.0.0`.

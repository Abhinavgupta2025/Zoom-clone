/**
 * Express + Socket.io signaling server for mediasoup SFU.
 * Port 4000 (configurable via process.env.PORT)
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createWorkers } = require("./workers");
const rooms = require("./rooms");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "mediasoup-sfu", timestamp: new Date().toISOString() });
});

// Socket.io signaling logic
io.on("connection", (socket) => {
  let currentMeetingCode = null;
  let currentParticipantId = null;

  console.log(`[Socket Connected] id=${socket.id}`);

  socket.on("join-room", async ({ meetingCode, participantId, displayName }, cb) => {
    try {
      currentMeetingCode = meetingCode;
      currentParticipantId = participantId;

      socket.join(meetingCode);
      await rooms.addPeer(meetingCode, participantId);

      const existingProducers = rooms.getExistingProducers(meetingCode, participantId);

      console.log(`[Join Room] peer=${participantId} (${displayName}) room=${meetingCode}`);
      if (cb) cb({ success: true, existingProducers });
    } catch (err) {
      console.error("[Socket] join-room error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("get-router-rtp-capabilities", async ({ meetingCode }, cb) => {
    try {
      const capabilities = await rooms.getRouterCapabilities(meetingCode);
      if (cb) cb({ capabilities });
    } catch (err) {
      console.error("[Socket] get-router-rtp-capabilities error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("create-webrtc-transport", async ({ meetingCode, participantId, direction }, cb) => {
    try {
      const { transportParams } = await rooms.createWebRtcTransport(
        meetingCode,
        participantId,
        direction
      );
      if (cb) cb({ transportParams });
    } catch (err) {
      console.error("[Socket] create-webrtc-transport error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("connect-transport", async ({ meetingCode, participantId, transportId, dtlsParameters }, cb) => {
    try {
      await rooms.connectTransport(meetingCode, participantId, transportId, dtlsParameters);
      if (cb) cb({ success: true });
    } catch (err) {
      console.error("[Socket] connect-transport error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("produce", async ({ meetingCode, participantId, transportId, kind, rtpParameters }, cb) => {
    try {
      const producerId = await rooms.produce(
        meetingCode,
        participantId,
        transportId,
        kind,
        rtpParameters
      );

      // Broadcast to other peers in the room that a new producer is available
      socket.to(meetingCode).emit("new-producer", {
        producerId,
        participantId,
        kind,
      });

      if (cb) cb({ producerId });
    } catch (err) {
      console.error("[Socket] produce error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("consume", async ({ meetingCode, participantId, producerId, rtpCapabilities }, cb) => {
    try {
      const consumerParams = await rooms.consume(
        meetingCode,
        participantId,
        producerId,
        rtpCapabilities
      );
      if (cb) cb({ consumerParams });
    } catch (err) {
      console.error("[Socket] consume error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("resume-consumer", async ({ meetingCode, participantId, consumerId }, cb) => {
    try {
      await rooms.resumeConsumer(meetingCode, participantId, consumerId);
      if (cb) cb({ success: true });
    } catch (err) {
      console.error("[Socket] resume-consumer error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("disconnect", () => {
    if (currentMeetingCode && currentParticipantId) {
      console.log(`[Socket] Disconnected: ${currentParticipantId} from room ${currentMeetingCode}`);
      rooms.removePeer(currentMeetingCode, currentParticipantId);
      socket.to(currentMeetingCode).emit("participant-left", {
        participantId: currentParticipantId,
      });
    }
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await createWorkers();
  server.listen(PORT, () => {
    console.log(`[mediasoup SFU] Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[mediasoup SFU] Failed to start:", err);
  process.exit(1);
});

/**
 * mediasoup SFU Signaling Server (Express + Socket.io)
 */

require("dotenv").config();
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
  res.json({ status: "ok", service: "mediasoup-sfu" });
});

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  let currentMeetingCode = null;
  let currentParticipantId = null;

  socket.on("join-room", async ({ meetingCode, participantId, displayName }, cb) => {
    try {
      currentMeetingCode = meetingCode;
      currentParticipantId = participantId;

      await rooms.addPeer(meetingCode, participantId, displayName);
      socket.join(meetingCode);

      // Get existing producers in the room to inform the newly joined participant
      const existingProducers = rooms.getExistingProducers(meetingCode, participantId);

      if (cb) cb({ success: true, existingProducers });

      console.log(`[Socket] ${displayName} (${participantId}) joined room ${meetingCode}`);
    } catch (err) {
      console.error("[Socket] join-room error:", err);
      if (cb) cb({ error: err.message });
    }
  });

  socket.on("get-router-rtp-capabilities", async ({ meetingCode }, cb) => {
    try {
      const rtpCapabilities = await rooms.getRouterCapabilities(meetingCode);
      if (cb) cb({ rtpCapabilities });
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
    console.log(`🚀 mediasoup SFU service listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start mediasoup SFU service:", err);
  process.exit(1);
});

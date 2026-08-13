/**
 * Room and Router management for mediasoup SFU.
 * Maps meetingCode -> { router, peers: Map<participantId, { sendTransport, recvTransport, producers, consumers }> }
 */

const mediasoup = require("mediasoup");
const { getWorker } = require("./workers");

const rooms = new Map();
let publicIp = process.env.ANNOUNCED_IP || null;

async function getAnnouncedIp() {
  if (publicIp) return publicIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    if (data && data.ip) {
      publicIp = data.ip;
      console.log(`[mediasoup] Auto-detected public ANNOUNCED_IP: ${publicIp}`);
      return publicIp;
    }
  } catch (e) {
    console.warn("[mediasoup] Public IP auto-detection failed, using 127.0.0.1");
  }
  publicIp = "127.0.0.1";
  return publicIp;
}

/**
 * Get or create a room for a given meeting code.
 * @param {string} meetingCode
 * @returns {Promise<{ router: mediasoup.Router, peers: Map }>}
 */
async function getOrCreateRoom(meetingCode) {
  if (rooms.has(meetingCode)) {
    return rooms.get(meetingCode);
  }

  const worker = getWorker();
  const mediaCodecs = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {
        "x-google-start-bitrate": 1000,
      },
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
  ];

  const router = await worker.createRouter({ mediaCodecs });
  console.log(`[Router Created] meetingCode=${meetingCode} routerId=${router.id}`);

  const room = {
    router,
    peers: new Map(),
  };

  rooms.set(meetingCode, room);
  return room;
}

/**
 * Add a peer to a room.
 * @param {string} meetingCode
 * @param {string} participantId
 * @returns {Promise<Object>} peer object
 */
async function addPeer(meetingCode, participantId) {
  const room = await getOrCreateRoom(meetingCode);
  if (room.peers.has(participantId)) {
    return room.peers.get(participantId);
  }

  const peer = {
    participantId,
    sendTransport: null,
    recvTransport: null,
    producers: new Map(),
    consumers: new Map(),
  };
  room.peers.set(participantId, peer);
  return peer;
}

/**
 * Get the RTP capabilities of the room's router.
 * @param {string} meetingCode
 * @returns {Promise<mediasoup.RtpCapabilities>}
 */
async function getRouterCapabilities(meetingCode) {
  const room = await getOrCreateRoom(meetingCode);
  return room.router.rtpCapabilities;
}

/**
 * Create a WebRTC transport (send or recv) for a peer.
 * @param {string} meetingCode
 * @param {string} participantId
 * @param {"send"|"recv"} direction
 * @returns {Promise<{ transportParams: Object, transport: mediasoup.WebRtcTransport }>}
 */
async function createWebRtcTransport(meetingCode, participantId, direction) {
  const room = await getOrCreateRoom(meetingCode);
  const peer = room.peers.get(participantId);
  if (!peer) throw new Error(`Peer ${participantId} not found in room ${meetingCode}`);

  const announced = await getAnnouncedIp();
  const transport = await room.router.createWebRtcTransport({
    listenIps: [
      {
        ip: process.env.LISTEN_IP || "0.0.0.0",
        announcedIp: announced,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });

  transport.on("dtlsstatechange", (state) => {
    if (state === "closed") transport.close();
  });

  // Store transport on peer
  if (direction === "send") {
    peer.sendTransport = transport;
  } else {
    peer.recvTransport = transport;
  }

  const transportParams = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };

  console.log(`[WebRtcTransport Created] peer=${participantId} dir=${direction} id=${transport.id}`);
  return { transportParams, transport };
}

/**
 * Connect a WebRTC transport with DTLS parameters.
 * @param {string} meetingCode
 * @param {string} participantId
 * @param {string} transportId
 * @param {Object} dtlsParameters
 */
async function connectTransport(meetingCode, participantId, transportId, dtlsParameters) {
  const room = rooms.get(meetingCode);
  if (!room) throw new Error(`Room ${meetingCode} not found`);

  const peer = room.peers.get(participantId);
  if (!peer) throw new Error(`Peer ${participantId} not found`);

  let transport = null;
  if (peer.sendTransport?.id === transportId) transport = peer.sendTransport;
  if (peer.recvTransport?.id === transportId) transport = peer.recvTransport;

  if (!transport) throw new Error(`Transport ${transportId} not found for peer ${participantId}`);

  await transport.connect({ dtlsParameters });
  console.log(`[Transport Connected] peer=${participantId} transportId=${transportId}`);
}

/**
 * Produce (client sends a track).
 * @param {string} meetingCode
 * @param {string} participantId
 * @param {string} transportId
 * @param {"audio"|"video"} kind
 * @param {Object} rtpParameters
 * @returns {Promise<string>} producerId
 */
async function produce(meetingCode, participantId, transportId, kind, rtpParameters) {
  const room = rooms.get(meetingCode);
  if (!room) throw new Error(`Room ${meetingCode} not found`);

  const peer = room.peers.get(participantId);
  if (!peer || peer.sendTransport?.id !== transportId)
    throw new Error("Send transport not found");

  const producer = await peer.sendTransport.produce({ kind, rtpParameters });

  producer.on("transportclose", () => producer.close());
  peer.producers.set(producer.id, producer);

  console.log(`[Produce] peer=${participantId} kind=${kind} producerId=${producer.id}`);
  return producer.id;
}

/**
 * Consume (client wants to receive another peer's track).
 * @param {string} meetingCode
 * @param {string} consumerParticipantId - the peer who wants to consume
 * @param {string} producerId
 * @param {Object} rtpCapabilities - of the consumer client's Device
 * @returns {Promise<Object>} consumer params to send back to client
 */
async function consume(meetingCode, consumerParticipantId, producerId, rtpCapabilities) {
  const room = rooms.get(meetingCode);
  if (!room) throw new Error(`Room ${meetingCode} not found`);

  const consumerPeer = room.peers.get(consumerParticipantId);
  if (!consumerPeer || !consumerPeer.recvTransport)
    throw new Error("Consumer recv transport not found");

  // Find the producer across all peers
  let producer = null;
  for (const peer of room.peers.values()) {
    if (peer.producers.has(producerId)) {
      producer = peer.producers.get(producerId);
      break;
    }
  }
  if (!producer) throw new Error(`Producer ${producerId} not found`);

  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
    throw new Error("Cannot consume: incompatible RTP capabilities");
  }

  const consumer = await consumerPeer.recvTransport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: false, // Start unpaused so video packets flow immediately!
  });

  consumer.on("transportclose", () => consumer.close());
  consumer.on("producerclose", () => {
    consumer.close();
    consumerPeer.consumers.delete(consumer.id);
  });

  consumerPeer.consumers.set(consumer.id, consumer);

  console.log(`[Consume] peer=${consumerParticipantId} producerId=${producer.id} consumerId=${consumer.id}`);

  return {
    id: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

/**
 * Resume a consumer on the SFU server.
 */
async function resumeConsumer(meetingCode, participantId, consumerId) {
  const room = rooms.get(meetingCode);
  if (!room) return;
  const peer = room.peers.get(participantId);
  if (!peer) return;
  const consumer = peer.consumers.get(consumerId);
  if (consumer) {
    await consumer.resume();
    console.log(`[Resume Consumer] peer=${participantId} consumerId=${consumerId}`);
  }
}

/**
 * Get all active producers in a room except the requesting peer's own producers.
 * @param {string} meetingCode
 * @param {string} excludeParticipantId
 * @returns {Array<{ producerId: string, participantId: string, kind: string }>}
 */
function getExistingProducers(meetingCode, excludeParticipantId) {
  const room = rooms.get(meetingCode);
  if (!room) return [];

  const list = [];
  for (const [pId, peer] of room.peers.entries()) {
    if (pId === excludeParticipantId) continue;
    for (const [producerId, producer] of peer.producers.entries()) {
      list.push({
        producerId,
        participantId: pId,
        kind: producer.kind,
      });
    }
  }
  return list;
}

/**
 * Clean up a peer when they leave or disconnect.
 * @param {string} meetingCode
 * @param {string} participantId
 */
function removePeer(meetingCode, participantId) {
  const room = rooms.get(meetingCode);
  if (!room) return;

  const peer = room.peers.get(participantId);
  if (!peer) return;

  // Close producers
  for (const producer of peer.producers.values()) {
    producer.close();
  }
  peer.producers.clear();

  // Close consumers
  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }
  peer.consumers.clear();

  // Close transports
  if (peer.sendTransport) peer.sendTransport.close();
  if (peer.recvTransport) peer.recvTransport.close();

  room.peers.delete(participantId);
  console.log(`[Peer Removed] peer=${participantId} room=${meetingCode}`);

  // If room is empty, close router and delete room
  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(meetingCode);
    console.log(`[Room Deleted] meetingCode=${meetingCode}`);
  }
}

module.exports = {
  getOrCreateRoom,
  addPeer,
  getRouterCapabilities,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  resumeConsumer,
  getExistingProducers,
  removePeer,
};

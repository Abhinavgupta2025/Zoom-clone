/**
 * Room manager — one Router per meeting room.
 *
 * Each room tracks:
 *   - router: mediasoup.Router
 *   - peers: Map<participantId, { sendTransport, recvTransport, producers, consumers }>
 */

const { getWorker } = require("./workers");

// Supported RTP codecs (audio + video)
const MEDIA_CODECS = [
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
    parameters: { "x-google-start-bitrate": 1000 },
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "4d0032",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
    },
  },
];

// rooms: Map<meetingCode, { router, peers: Map<participantId, Peer> }>
const rooms = new Map();

/**
 * @typedef {Object} Peer
 * @property {string} participantId
 * @property {string} displayName
 * @property {mediasoup.WebRtcTransport|null} sendTransport
 * @property {mediasoup.WebRtcTransport|null} recvTransport
 * @property {Map<string, mediasoup.Producer>} producers  - producerId -> Producer
 * @property {Map<string, mediasoup.Consumer>} consumers  - consumerId -> Consumer
 */

/**
 * Get or create a room for a meeting code.
 * @param {string} meetingCode
 * @returns {Promise<{ router: mediasoup.Router, peers: Map }>}
 */
async function getOrCreateRoom(meetingCode) {
  if (rooms.has(meetingCode)) {
    return rooms.get(meetingCode);
  }

  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  const room = { router, peers: new Map() };
  rooms.set(meetingCode, room);
  console.log(`[Room] Created room for meeting: ${meetingCode}`);
  return room;
}

/**
 * Add a peer to a room.
 * @param {string} meetingCode
 * @param {string} participantId
 * @param {string} displayName
 * @returns {Promise<Peer>}
 */
async function addPeer(meetingCode, participantId, displayName) {
  const room = await getOrCreateRoom(meetingCode);
  const peer = {
    participantId,
    displayName,
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

  const transport = await room.router.createWebRtcTransport({
    listenIps: [
      {
        ip: process.env.LISTEN_IP || "0.0.0.0",
        announcedIp: process.env.ANNOUNCED_IP || "127.0.0.1",
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

  return {
    transportParams: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
    transport,
  };
}

/**
 * Connect a transport (client provides DTLS params after createWebRtcTransport).
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

  const transport =
    peer.sendTransport?.id === transportId
      ? peer.sendTransport
      : peer.recvTransport?.id === transportId
      ? peer.recvTransport
      : null;

  if (!transport) throw new Error(`Transport ${transportId} not found`);

  await transport.connect({ dtlsParameters });
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
    paused: true, // client must call consumer.resume() after receiving params
  });

  consumer.on("transportclose", () => consumer.close());
  consumer.on("producerclose", () => {
    consumer.close();
    consumerPeer.consumers.delete(consumer.id);
  });

  consumerPeer.consumers.set(consumer.id, consumer);

  return {
    consumerId: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

/**
 * Get all producer IDs in a room (excluding a specific peer's own producers).
 * @param {string} meetingCode
 * @param {string} excludeParticipantId
 * @returns {{ participantId: string, producerId: string, kind: string }[]}
 */
function getExistingProducers(meetingCode, excludeParticipantId) {
  const room = rooms.get(meetingCode);
  if (!room) return [];

  const result = [];
  for (const [pid, peer] of room.peers.entries()) {
    if (pid === excludeParticipantId) continue;
    for (const [producerId, producer] of peer.producers.entries()) {
      result.push({ participantId: pid, producerId, kind: producer.kind });
    }
  }
  return result;
}

/**
 * Remove a peer and close all their transports/producers/consumers.
 * @param {string} meetingCode
 * @param {string} participantId
 */
function removePeer(meetingCode, participantId) {
  const room = rooms.get(meetingCode);
  if (!room) return;

  const peer = room.peers.get(participantId);
  if (!peer) return;

  peer.producers.forEach((p) => p.close());
  peer.consumers.forEach((c) => c.close());
  peer.sendTransport?.close();
  peer.recvTransport?.close();
  room.peers.delete(participantId);

  console.log(`[Room] Peer removed: ${participantId} from room ${meetingCode}`);

  // Clean up empty rooms
  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(meetingCode);
    console.log(`[Room] Room closed: ${meetingCode}`);
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
  getExistingProducers,
  removePeer,
};

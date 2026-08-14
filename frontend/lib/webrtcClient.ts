export interface RemoteTrack {
  participantId: string;
  kind: "audio" | "video";
  stream: MediaStream;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export class WebRTCClientManager {
  private ws: WebSocket | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map(); // targetParticipantId -> RTCPeerConnection
  private remoteStreams: Map<string, MediaStream> = new Map(); // targetParticipantId -> MediaStream
  private onRemoteTracksCallback?: (tracks: RemoteTrack[]) => void;

  constructor(
    private meetingCode: string,
    private participantId: string,
    private displayName: string,
    private localStream: MediaStream | null
  ) {}

  public onRemoteTracks(cb: (tracks: RemoteTrack[]) => void) {
    this.onRemoteTracksCallback = cb;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      apiBase = apiBase.replace(/\/+$/, "");
      
      const wsProto = apiBase.startsWith("https") ? "wss:" : "ws:";
      const cleanHost = apiBase.replace(/^https?:\/\//, "");
      const wsUrl = `${wsProto}//${cleanHost}/ws/meetings/${this.meetingCode}`;

      console.log("[WebRTC] Connecting to signaling server:", wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[WebRTC] WebSocket open. Sending join...");
        this.ws?.send(
          JSON.stringify({
            type: "join",
            participant_id: this.participantId,
            display_name: this.displayName,
          })
        );
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error("[WebRTC] WebSocket error:", err);
        reject(err);
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleSignalingMessage(data);
        } catch (e) {
          console.error("[WebRTC] Error handling message:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("[WebRTC] WebSocket closed.");
      };
    });
  }

  private async handleSignalingMessage(data: any) {
    const { type, participant_id, existing_peers, sender_participant_id, sdp, candidate } = data;

    switch (type) {
      case "joined":
        console.log("[WebRTC] Joined room. Existing peers in room:", existing_peers);
        // Create PeerConnections for existing peers and send Offer
        if (Array.isArray(existing_peers)) {
          for (const peerId of existing_peers) {
            await this.createOfferToPeer(peerId);
          }
        }
        break;

      case "peer-joined":
        console.log("[WebRTC] New peer joined room:", participant_id);
        // Create PeerConnection wrapper for new peer
        this.getOrCreatePeerConnection(participant_id);
        break;

      case "offer":
        console.log("[WebRTC] Received offer from:", sender_participant_id);
        await this.handleOffer(sender_participant_id, sdp);
        break;

      case "answer":
        console.log("[WebRTC] Received answer from:", sender_participant_id);
        await this.handleAnswer(sender_participant_id, sdp);
        break;

      case "ice-candidate":
        console.log("[WebRTC] Received ICE candidate from:", sender_participant_id);
        await this.handleIceCandidate(sender_participant_id, candidate);
        break;

      case "peer-left":
        console.log("[WebRTC] Peer left:", participant_id);
        this.removePeer(participant_id);
        break;
    }
  }

  private getOrCreatePeerConnection(targetParticipantId: string): RTCPeerConnection {
    if (this.peerConnections.has(targetParticipantId)) {
      return this.peerConnections.get(targetParticipantId)!;
    }

    console.log("[WebRTC] Creating RTCPeerConnection for target:", targetParticipantId);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(targetParticipantId, pc);

    // Add local tracks to PeerConnection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Send local ICE candidates to target peer via WebSocket
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "ice-candidate",
            target_participant_id: targetParticipantId,
            candidate: event.candidate,
          })
        );
      }
    };

    // Capture remote stream when tracks arrive
    pc.ontrack = (event) => {
      console.log("[WebRTC] Received remote track from:", targetParticipantId, event.track.kind);
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      this.remoteStreams.set(targetParticipantId, stream);
      this.notifyRemoteTracksChanged();
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${targetParticipantId} connection state:`, pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removePeer(targetParticipantId);
      }
    };

    return pc;
  }

  private async createOfferToPeer(targetParticipantId: string) {
    const pc = this.getOrCreatePeerConnection(targetParticipantId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "offer",
          target_participant_id: targetParticipantId,
          sdp: offer,
        })
      );
    }
  }

  private async handleOffer(senderParticipantId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.getOrCreatePeerConnection(senderParticipantId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "answer",
          target_participant_id: senderParticipantId,
          sdp: answer,
        })
      );
    }
  }

  private async handleAnswer(senderParticipantId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(senderParticipantId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  private async handleIceCandidate(senderParticipantId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(senderParticipantId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[WebRTC] Error adding ICE candidate:", e);
      }
    }
  }

  private removePeer(participantId: string) {
    const pc = this.peerConnections.get(participantId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(participantId);
    }
    this.remoteStreams.delete(participantId);
    this.notifyRemoteTracksChanged();
  }

  private notifyRemoteTracksChanged() {
    if (!this.onRemoteTracksCallback) return;

    const list: RemoteTrack[] = [];
    this.remoteStreams.forEach((stream, pId) => {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        list.push({ participantId: pId, kind: "video", stream });
      }
      if (audioTrack) {
        list.push({ participantId: pId, kind: "audio", stream });
      }
    });

    this.onRemoteTracksCallback(list);
  }

  public disconnect() {
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

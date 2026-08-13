import { Device, types } from "mediasoup-client";
import { io, Socket } from "socket.io-client";

const MEDIASOUP_SERVER_URL = process.env.NEXT_PUBLIC_MEDIASOUP_URL || "http://localhost:4000";

export interface RemoteTrack {
  participantId: string;
  producerId: string;
  kind: "audio" | "video";
  track: MediaStreamTrack;
  stream: MediaStream;
}

export class MediasoupClientManager {
  private socket: Socket | null = null;
  private device: Device | null = null;
  private sendTransport: types.Transport | null = null;
  private recvTransport: types.Transport | null = null;

  public audioProducer: types.Producer | null = null;
  public videoProducer: types.Producer | null = null;

  private remoteTracks: Map<string, RemoteTrack> = new Map(); // consumerId -> RemoteTrack
  private onRemoteTrackCallback?: (tracks: RemoteTrack[]) => void;

  constructor(
    private meetingCode: string,
    private participantId: string,
    private displayName: string
  ) {}

  public onRemoteTracks(cb: (tracks: RemoteTrack[]) => void) {
    this.onRemoteTrackCallback = cb;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(MEDIASOUP_SERVER_URL, {
        transports: ["websocket"],
      });

      this.socket.on("connect", async () => {
        console.log("[SFU] Socket connected:", this.socket?.id);

        try {
          // 1. Join room
          const joinRes: any = await this.emitAsync("join-room", {
            meetingCode: this.meetingCode,
            participantId: this.participantId,
            displayName: this.displayName,
          });

          if (joinRes.error) {
            reject(new Error(joinRes.error));
            return;
          }

          // 2. Load device capabilities
          const routerCapsRes: any = await this.emitAsync("get-router-rtp-capabilities", {
            meetingCode: this.meetingCode,
          });

          this.device = new Device();
          await this.device.load({ routerRtpCapabilities: routerCapsRes.capabilities });

          // 3. Create send and recv transports
          await this.createSendTransport();
          await this.createRecvTransport();

          // 4. Consume existing producers in room
          const existingProducers: any[] = joinRes.existingProducers || [];
          for (const prod of existingProducers) {
            await this.consumeProducer(prod.producerId, prod.participantId);
          }

          // 5. Listen for new producers in room
          this.socket?.on("new-producer", async ({ producerId, participantId }: any) => {
            await this.consumeProducer(producerId, participantId);
          });

          this.socket?.on("participant-left", ({ participantId }: any) => {
            this.handleParticipantLeft(participantId);
          });

          resolve();
        } catch (err: any) {
          reject(err);
        }
      });

      this.socket?.on("connect_error", (err) => {
        reject(new Error(`Failed to connect to SFU: ${err.message}`));
      });
    });
  }

  public async produceLocalTracks(stream: MediaStream): Promise<void> {
    if (!this.sendTransport) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack && !this.audioProducer) {
      this.audioProducer = await this.sendTransport.produce({ track: audioTrack });
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && !this.videoProducer) {
      this.videoProducer = await this.sendTransport.produce({ track: videoTrack });
    }
  }

  private async createSendTransport(): Promise<void> {
    if (!this.device) return;

    const res: any = await this.emitAsync("create-webrtc-transport", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      direction: "send",
    });

    const { transportParams } = res;
    this.sendTransport = this.device.createSendTransport(transportParams);

    this.sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.emitAsync("connect-transport", {
          meetingCode: this.meetingCode,
          participantId: this.participantId,
          transportId: this.sendTransport?.id,
          dtlsParameters,
        });
        callback();
      } catch (err: any) {
        errback(err);
      }
    });

    this.sendTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const prodRes: any = await this.emitAsync("produce", {
          meetingCode: this.meetingCode,
          participantId: this.participantId,
          transportId: this.sendTransport?.id,
          kind,
          rtpParameters,
        });
        callback({ id: prodRes.producerId });
      } catch (err: any) {
        errback(err);
      }
    });
  }

  private async createRecvTransport(): Promise<void> {
    if (!this.device) return;

    const res: any = await this.emitAsync("create-webrtc-transport", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      direction: "recv",
    });

    const { transportParams } = res;
    this.recvTransport = this.device.createRecvTransport(transportParams);

    this.recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.emitAsync("connect-transport", {
          meetingCode: this.meetingCode,
          participantId: this.participantId,
          transportId: this.recvTransport?.id,
          dtlsParameters,
        });
        callback();
      } catch (err: any) {
        errback(err);
      }
    });
  }

  public toggleAudio(enabled: boolean): void {
    if (this.audioProducer) {
      if (enabled) {
        this.audioProducer.resume();
      } else {
        this.audioProducer.pause();
      }
    }
  }

  public toggleVideo(enabled: boolean): void {
    if (this.videoProducer) {
      if (enabled) {
        this.videoProducer.resume();
      } else {
        this.videoProducer.pause();
      }
    }
  }

  private async consumeProducer(producerId: string, participantId: string): Promise<void> {
    if (!this.device || !this.recvTransport) return;

    const res: any = await this.emitAsync("consume", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (res.error) {
      console.error("[SFU] Consume error:", res.error);
      return;
    }

    const { consumerParams } = res;
    const consumer = await this.recvTransport.consume({
      id: consumerParams.id || consumerParams.consumerId,
      producerId: consumerParams.producerId,
      kind: consumerParams.kind,
      rtpParameters: consumerParams.rtpParameters,
    });

    // Unpause local consumer track and tell SFU server to resume consumer
    await consumer.resume();
    await this.emitAsync("resume-consumer", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      consumerId: consumer.id,
    });

    const { track } = consumer;
    const stream = new MediaStream([track]);

    this.remoteTracks.set(consumer.id, {
      participantId,
      producerId,
      kind: consumer.kind as "audio" | "video",
      track,
      stream,
    });

    this.notifyRemoteTracksChanged();
  }

  private handleParticipantLeft(participantId: string): void {
    let changed = false;
    this.remoteTracks.forEach((item, key) => {
      if (item.participantId === participantId) {
        this.remoteTracks.delete(key);
        changed = true;
      }
    });
    if (changed) this.notifyRemoteTracksChanged();
  }

  private notifyRemoteTracksChanged(): void {
    if (this.onRemoteTrackCallback) {
      this.onRemoteTrackCallback(Array.from(this.remoteTracks.values()));
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.audioProducer = null;
    this.videoProducer = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.remoteTracks.clear();
  }

  private emitAsync(event: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ error: "Socket not initialized" });
        return;
      }
      this.socket.emit(event, data, (response: any) => {
        resolve(response || {});
      });
    });
  }
}

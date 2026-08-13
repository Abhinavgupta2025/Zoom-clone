import { Device } from "mediasoup-client";
import { Transport, Producer, Consumer, RtpCapabilities } from "mediasoup-client/lib/types";
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
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;

  public audioProducer: Producer | null = null;
  public videoProducer: Producer | null = null;

  private remoteTracks: Map<string, RemoteTrack> = new Map(); // consumerId -> RemoteTrack
  private onRemoteTrackCallback?: (tracks: RemoteTrack[]) => void;

  constructor(private meetingCode: string, private participantId: string, private displayName: string) {}

  public async connect(onRemoteTrackUpdate: (tracks: RemoteTrack[]) => void): Promise<void> {
    this.onRemoteTrackCallback = onRemoteTrackUpdate;

    return new Promise((resolve, reject) => {
      this.socket = io(MEDIASOUP_SERVER_URL);

      this.socket.on("connect", async () => {
        try {
          // 1. Join room
          const joinRes: any = await this.emitAsync("join-room", {
            meetingCode: this.meetingCode,
            participantId: this.participantId,
            displayName: this.displayName,
          });

          if (joinRes.error) throw new Error(joinRes.error);

          // 2. Init mediasoup Device
          const capsRes: any = await this.emitAsync("get-router-rtp-capabilities", {
            meetingCode: this.meetingCode,
          });

          if (capsRes.error) throw new Error(capsRes.error);

          this.device = new Device();
          await this.device.load({ routerRtpCapabilities: capsRes.rtpCapabilities });

          // 3. Create Transports
          await this.initSendTransport();
          await this.initRecvTransport();

          // 4. Consume existing producers if any
          if (joinRes.existingProducers && joinRes.existingProducers.length > 0) {
            for (const prod of joinRes.existingProducers) {
              await this.consumeProducer(prod.producerId, prod.participantId);
            }
          }

          // 5. Listen for new producers in room
          this.socket.on("new-producer", async ({ producerId, participantId }: any) => {
            await this.consumeProducer(producerId, participantId);
          });

          // 6. Listen for left participants
          this.socket.on("participant-left", ({ participantId }: any) => {
            this.handleParticipantLeft(participantId);
          });

          resolve();
        } catch (err) {
          reject(err);
        }
      });

      this.socket.on("connect_error", (err) => {
        reject(new Error(`Failed to connect to SFU: ${err.message}`));
      });
    });
  }

  private emitAsync(event: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ error: "Socket not connected" });
      this.socket.emit(event, data, (response: any) => {
        resolve(response || {});
      });
    });
  }

  private async initSendTransport(): Promise<void> {
    if (!this.device) return;

    const res: any = await this.emitAsync("create-webrtc-transport", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      direction: "send",
    });

    if (res.error) throw new Error(res.error);

    this.sendTransport = this.device.createSendTransport(res.transportParams);

    this.sendTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.emitAsync("connect-transport", {
          meetingCode: this.meetingCode,
          participantId: this.participantId,
          transportId: this.sendTransport!.id,
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
          transportId: this.sendTransport!.id,
          kind,
          rtpParameters,
        });
        callback({ id: prodRes.producerId });
      } catch (err: any) {
        errback(err);
      }
    });
  }

  private async initRecvTransport(): Promise<void> {
    if (!this.device) return;

    const res: any = await this.emitAsync("create-webrtc-transport", {
      meetingCode: this.meetingCode,
      participantId: this.participantId,
      direction: "recv",
    });

    if (res.error) throw new Error(res.error);

    this.recvTransport = this.device.createRecvTransport(res.transportParams);

    this.recvTransport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.emitAsync("connect-transport", {
          meetingCode: this.meetingCode,
          participantId: this.participantId,
          transportId: this.recvTransport!.id,
          dtlsParameters,
        });
        callback();
      } catch (err: any) {
        errback(err);
      }
    });
  }

  public async produceTracks(audioTrack?: MediaStreamTrack, videoTrack?: MediaStreamTrack): Promise<void> {
    if (!this.sendTransport) return;

    if (audioTrack) {
      this.audioProducer = await this.sendTransport.produce({ track: audioTrack });
    }
    if (videoTrack) {
      this.videoProducer = await this.sendTransport.produce({ track: videoTrack });
    }
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
    for (const [key, item] of this.remoteTracks.entries()) {
      if (item.participantId === participantId) {
        this.remoteTracks.delete(key);
        changed = true;
      }
    }
    if (changed) this.notifyRemoteTracksChanged();
  }

  private notifyRemoteTracksChanged(): void {
    if (this.onRemoteTrackCallback) {
      this.onRemoteTrackCallback(Array.from(this.remoteTracks.values()));
    }
  }

  public disconnect(): void {
    this.audioProducer?.close();
    this.videoProducer?.close();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.socket?.disconnect();
  }
}

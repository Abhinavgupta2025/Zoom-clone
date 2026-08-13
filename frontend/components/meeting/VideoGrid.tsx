"use client";

import { VideoTile } from "./VideoTile";
import { RemoteTrack } from "@/lib/mediasoupClient";

interface VideoGridProps {
  localStream?: MediaStream | null;
  localDisplayName: string;
  localMuted: boolean;
  localVideoOff: boolean;
  remoteTracks: RemoteTrack[];
}

export function VideoGrid({
  localStream,
  localDisplayName,
  localMuted,
  localVideoOff,
  remoteTracks,
}: VideoGridProps) {
  // Group remote tracks by participantId
  const participantMap = new Map<string, { videoStream?: MediaStream; audioStream?: MediaStream }>();

  remoteTracks.forEach((rt) => {
    const existing = participantMap.get(rt.participantId) || {};
    if (rt.kind === "video") {
      existing.videoStream = rt.stream;
    } else if (rt.kind === "audio") {
      existing.audioStream = rt.stream;
    }
    participantMap.set(rt.participantId, existing);
  });

  const remoteParticipants = Array.from(participantMap.entries());
  const totalCount = 1 + remoteParticipants.length;

  // Responsive grid class determination
  let gridColsClass = "grid-cols-1";
  if (totalCount === 2) gridColsClass = "grid-cols-1 md:grid-cols-2";
  else if (totalCount >= 3 && totalCount <= 4) gridColsClass = "grid-cols-2";
  else if (totalCount >= 5) gridColsClass = "grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`w-full h-full grid gap-4 p-4 ${gridColsClass} auto-rows-fr items-center justify-center`}>
      {/* Local participant tile */}
      <VideoTile
        stream={localStream}
        displayName={localDisplayName}
        isLocal
        isMuted={localMuted}
        isVideoOff={localVideoOff}
      />

      {/* Remote participant tiles */}
      {remoteParticipants.map(([participantId, streams]) => (
        <VideoTile
          key={participantId}
          stream={streams.videoStream}
          displayName={`Participant ${participantId.slice(0, 5)}`}
          isMuted={!streams.audioStream}
          isVideoOff={!streams.videoStream}
        />
      ))}
    </div>
  );
}

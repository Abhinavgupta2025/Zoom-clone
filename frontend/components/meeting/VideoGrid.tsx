"use client";

import { VideoTile } from "./VideoTile";
import { RemoteTrack } from "@/lib/webrtcClient";
import { Participant } from "@/types";

interface VideoGridProps {
  localStream?: MediaStream | null;
  localDisplayName: string;
  localMuted: boolean;
  localVideoOff: boolean;
  remoteTracks: RemoteTrack[];
  participants?: Participant[];
  localParticipantId?: number;
}

export function VideoGrid({
  localStream,
  localDisplayName,
  localMuted,
  localVideoOff,
  remoteTracks,
  participants = [],
  localParticipantId,
}: VideoGridProps) {
  // Filter out local participant from DB room list
  const remoteDbParticipants = participants.filter((p) => p.id !== localParticipantId);

  // Group remote WebRTC tracks by participantId
  const trackMap = new Map<string, { videoStream?: MediaStream; audioStream?: MediaStream }>();
  remoteTracks.forEach((rt) => {
    const existing = trackMap.get(rt.participantId) || {};
    if (rt.kind === "video") existing.videoStream = rt.stream;
    if (rt.kind === "audio") existing.audioStream = rt.stream;
    trackMap.set(rt.participantId, existing);
  });

  // Combine DB presence list with WebRTC streams
  let displayRemoteList: Array<{
    id: string;
    displayName: string;
    videoStream?: MediaStream;
    audioStream?: MediaStream;
    isMuted: boolean;
  }> = [];

  if (remoteDbParticipants.length > 0) {
    displayRemoteList = remoteDbParticipants.map((p, index) => {
      const tracks = trackMap.get(p.id.toString()) || {};
      const formattedName =
        p.display_name.startsWith("Guest") || p.display_name.startsWith("Participant")
          ? `Participant ${index + 2}`
          : p.display_name;

      return {
        id: p.id.toString(),
        displayName: formattedName,
        videoStream: tracks.videoStream,
        audioStream: tracks.audioStream,
        isMuted: p.is_muted,
      };
    });
  } else {
    displayRemoteList = Array.from(trackMap.entries()).map(([id, tracks], index) => ({
      id,
      displayName: `Participant ${index + 2}`,
      videoStream: tracks.videoStream,
      audioStream: tracks.audioStream,
      isMuted: !tracks.audioStream,
    }));
  }

  const totalCount = 1 + displayRemoteList.length;

  // Responsive grid layout calculation
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
      {displayRemoteList.map((item) => (
        <VideoTile
          key={item.id}
          stream={item.videoStream}
          displayName={item.displayName}
          isMuted={item.isMuted}
          isVideoOff={!item.videoStream}
        />
      ))}
    </div>
  );
}

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

  // Map participant ID -> Display Name
  const participantNameMap = new Map<string, string>();
  participants.forEach((p) => {
    participantNameMap.set(p.id.toString(), p.display_name);
  });

  let displayRemoteList: Array<{
    id: string;
    displayName: string;
    videoStream?: MediaStream;
    audioStream?: MediaStream;
    isMuted: boolean;
  }> = [];

  if (trackMap.size > 0) {
    // Driven by ACTUAL connected WebRTC peer streams
    displayRemoteList = Array.from(trackMap.entries()).map(([pId, tracks]) => {
      const dbName = participantNameMap.get(pId);
      return {
        id: pId,
        displayName: dbName || `Guest (${pId})`,
        videoStream: tracks.videoStream,
        audioStream: tracks.audioStream,
        isMuted: false,
      };
    });
  } else {
    // Driven by unique active DB participants
    const seenNames = new Set<string>();
    const uniqueParticipants = remoteDbParticipants.filter((p) => {
      if (seenNames.has(p.display_name)) return false;
      seenNames.add(p.display_name);
      return true;
    });

    displayRemoteList = uniqueParticipants.map((p) => ({
      id: p.id.toString(),
      displayName: p.display_name,
      videoStream: undefined,
      audioStream: undefined,
      isMuted: p.is_muted,
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

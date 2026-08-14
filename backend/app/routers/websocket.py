from __future__ import annotations

"""
WebSocket Signaling Server for WebRTC P2P/Mesh Audio & Video.
Handles room presence, WebRTC SDP offers/answers, and ICE candidates.
"""

import json
import logging
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("websocket")
router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """Manages active WebSockets grouped by meeting_code."""

    def __init__(self):
        # meeting_code -> dict of participant_id -> WebSocket
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_code: str, participant_id: str):
        await websocket.accept()
        if meeting_code not in self.rooms:
            self.rooms[meeting_code] = {}
        self.rooms[meeting_code][participant_id] = websocket
        logger.info(f"[WS] Peer {participant_id} joined room {meeting_code}. Total peers: {len(self.rooms[meeting_code])}")

    def disconnect(self, meeting_code: str, participant_id: str):
        if meeting_code in self.rooms and participant_id in self.rooms[meeting_code]:
            del self.rooms[meeting_code][participant_id]
            logger.info(f"[WS] Peer {participant_id} left room {meeting_code}")
            if not self.rooms[meeting_code]:
                del self.rooms[meeting_code]

    async def send_to_peer(self, meeting_code: str, target_participant_id: str, message: dict):
        if meeting_code in self.rooms and target_participant_id in self.rooms[meeting_code]:
            ws = self.rooms[meeting_code][target_participant_id]
            await ws.send_text(json.dumps(message))

    async def broadcast_to_room(self, meeting_code: str, message: dict, exclude_participant_id: str = None):
        if meeting_code not in self.rooms:
            return
        msg_str = json.dumps(message)
        for p_id, ws in list(self.rooms[meeting_code].items()):
            if exclude_participant_id and p_id == exclude_participant_id:
                continue
            try:
                await ws.send_text(msg_str)
            except Exception as e:
                logger.error(f"[WS] Error broadcasting to {p_id}: {e}")

    def get_existing_peers(self, meeting_code: str, exclude_participant_id: str) -> list[str]:
        if meeting_code not in self.rooms:
            return []
        return [p_id for p_id in self.rooms[meeting_code].keys() if p_id != exclude_participant_id]


manager = ConnectionManager()


@router.websocket("/meetings/{meeting_code}")
async def meeting_signaling(websocket: WebSocket, meeting_code: str):
    participant_id: str = None

    try:
        # Wait for initial join message
        init_raw = await websocket.receive_text()
        init_data = json.loads(init_raw)

        if init_data.get("type") == "join":
            participant_id = str(init_data.get("participant_id"))
            display_name = init_data.get("display_name", "Guest")

            await manager.connect(websocket, meeting_code, participant_id)

            # Get list of existing peers in the room
            existing_peers = manager.get_existing_peers(meeting_code, participant_id)

            # 1. Send join response back to newly joined peer
            await websocket.send_text(json.dumps({
                "type": "joined",
                "participant_id": participant_id,
                "existing_peers": existing_peers,
            }))

            # 2. Broadcast peer-joined to all existing room members
            await manager.broadcast_to_room(
                meeting_code,
                {
                    "type": "peer-joined",
                    "participant_id": participant_id,
                    "display_name": display_name,
                },
                exclude_participant_id=participant_id,
            )

        # Message loop for WebRTC signaling (Offer, Answer, ICE candidate)
        while True:
            data_raw = await websocket.receive_text()
            data = json.loads(data_raw)
            msg_type = data.get("type")

            if msg_type in ("offer", "answer", "ice-candidate"):
                target_id = str(data.get("target_participant_id"))
                # Relay signal directly to the target peer
                data["sender_participant_id"] = participant_id
                await manager.send_to_peer(meeting_code, target_id, data)

            elif msg_type == "state-update":
                # Broadcast audio mute or video off toggle state to all peers
                data["sender_participant_id"] = participant_id
                await manager.broadcast_to_room(meeting_code, data, exclude_participant_id=participant_id)

    except WebSocketDisconnect:
        logger.info(f"[WS] Disconnected websocket for peer {participant_id} in {meeting_code}")
    except Exception as e:
        logger.error(f"[WS] Exception in signaling loop: {e}")
    finally:
        if participant_id and meeting_code:
            manager.disconnect(meeting_code, participant_id)
            await manager.broadcast_to_room(
                meeting_code,
                {
                    "type": "peer-left",
                    "participant_id": participant_id,
                },
            )

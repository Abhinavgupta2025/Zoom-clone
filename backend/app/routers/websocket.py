from __future__ import annotations

"""WebSocket presence channel — lightweight participant join/leave broadcasts."""


import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app import crud

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# In-memory registry: meeting_code -> set of connected WebSockets
_rooms: dict[str, set[WebSocket]] = {}


async def _broadcast(meeting_code: str, message: dict) -> None:
    """Send a JSON message to all connected clients in the room."""
    sockets = _rooms.get(meeting_code, set())
    dead: set[WebSocket] = set()
    for ws in sockets:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.add(ws)
    for ws in dead:
        sockets.discard(ws)


@router.websocket("/ws/meetings/{meeting_code}")
async def meeting_presence(websocket: WebSocket, meeting_code: str):
    await websocket.accept()
    _rooms.setdefault(meeting_code, set()).add(websocket)
    logger.info("WS client joined room %s (total: %d)", meeting_code, len(_rooms[meeting_code]))

    try:
        # Send current participant list on connect
        async with AsyncSessionLocal() as db:
            meeting = await crud.get_meeting_by_code(db, meeting_code)
            if meeting:
                participants = await crud.get_active_participants(db, meeting.id)
                await websocket.send_text(json.dumps({
                    "event": "init",
                    "participants": [
                        {
                            "id": p.id,
                            "display_name": p.display_name,
                            "is_host": p.is_host,
                            "is_muted": p.is_muted,
                        }
                        for p in participants
                    ],
                }))

        # Listen for presence events from the client
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                event = data.get("event")

                if event == "joined":
                    await _broadcast(meeting_code, {
                        "event": "participant_joined",
                        "participant": {
                            "id": data.get("participant_id"),
                            "display_name": data.get("display_name"),
                            "is_host": data.get("is_host", False),
                            "is_muted": False,
                        },
                    })

                elif event == "left":
                    await _broadcast(meeting_code, {
                        "event": "participant_left",
                        "participant_id": data.get("participant_id"),
                    })

                elif event == "muted":
                    await _broadcast(meeting_code, {
                        "event": "participant_muted",
                        "participant_id": data.get("participant_id"),
                        "is_muted": data.get("is_muted", True),
                    })

                elif event == "ping":
                    await websocket.send_text(json.dumps({"event": "pong"}))

            except json.JSONDecodeError:
                logger.warning("Invalid JSON from WS client in room %s", meeting_code)

    except WebSocketDisconnect:
        logger.info("WS client disconnected from room %s", meeting_code)
    finally:
        _rooms.get(meeting_code, set()).discard(websocket)
        if not _rooms.get(meeting_code):
            _rooms.pop(meeting_code, None)

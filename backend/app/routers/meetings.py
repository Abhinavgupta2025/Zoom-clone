from __future__ import annotations

"""Meeting REST API router — all endpoints with Redis cache + rate limiting + audit logging."""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud
from app.cache import (
    KEY_MEETING,
    KEY_MEETINGS_RECENT,
    KEY_MEETINGS_UPCOMING,
    KEY_PARTICIPANTS,
    TTL_MEETING,
    TTL_MEETINGS_LIST,
    TTL_PARTICIPANTS,
    cache,
)
from app.config import settings
from app.database import get_db
from app.schemas import (
    ApiAuditLogOut,
    InstantMeetingOut,
    JoinRequest,
    JoinResponse,
    LeaveRequest,
    MeetingDetail,
    MeetingOut,
    MuteAllResponse,
    ParticipantOut,
    RemoveParticipantResponse,
    ScheduleMeetingIn,
)
from app.shorturl import format_code

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _get_base_url(request: Request) -> str:
    origin = request.headers.get("origin")
    if origin:
        return origin
    return "http://localhost:3000"


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# ---------------------------------------------------------------------------
# GET /api/meetings/audit-logs (API Creation History)
# ---------------------------------------------------------------------------
@router.get("/audit-logs", response_model=List[ApiAuditLogOut])
async def list_api_audit_logs(db: AsyncSession = Depends(get_db)):
    logs = await crud.get_api_audit_logs(db, limit=50)
    return [ApiAuditLogOut.model_validate(l) for l in logs]


# ---------------------------------------------------------------------------
# POST /api/meetings/instant
# ---------------------------------------------------------------------------
@router.post("/instant", response_model=InstantMeetingOut, status_code=status.HTTP_201_CREATED)
async def create_instant_meeting(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    meeting = await crud.create_instant_meeting(
        db,
        host_id=settings.DEFAULT_USER_ID,
        base_url=_get_base_url(request),
        client_ip=_get_client_ip(request),
    )
    await cache.delete(KEY_MEETINGS_UPCOMING.format(user_id=settings.DEFAULT_USER_ID))

    return InstantMeetingOut(
        meeting_code=format_code(meeting.meeting_code),
        invite_link=meeting.invite_link or "",
        meeting=MeetingOut.model_validate(meeting),
    )


# ---------------------------------------------------------------------------
# POST /api/meetings/schedule
# ---------------------------------------------------------------------------
@router.post("/schedule", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def schedule_meeting(
    body: ScheduleMeetingIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    meeting = await crud.create_scheduled_meeting(
        db,
        host_id=settings.DEFAULT_USER_ID,
        title=body.title,
        description=body.description,
        scheduled_start=body.scheduled_start,
        duration_minutes=body.duration_minutes,
        base_url=_get_base_url(request),
        client_ip=_get_client_ip(request),
    )
    await cache.delete(KEY_MEETINGS_UPCOMING.format(user_id=settings.DEFAULT_USER_ID))
    return MeetingOut.model_validate(meeting)


# ---------------------------------------------------------------------------
# GET /api/meetings/upcoming
# ---------------------------------------------------------------------------
@router.get("/upcoming", response_model=List[MeetingOut])
async def list_upcoming(db: AsyncSession = Depends(get_db)):
    cache_key = KEY_MEETINGS_UPCOMING.format(user_id=settings.DEFAULT_USER_ID)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    meetings = await crud.get_upcoming_meetings(db, settings.DEFAULT_USER_ID)
    result = [MeetingOut.model_validate(m).model_dump(mode="json") for m in meetings]
    await cache.set(cache_key, result, ttl=TTL_MEETINGS_LIST)
    return result


# ---------------------------------------------------------------------------
# GET /api/meetings/recent
# ---------------------------------------------------------------------------
@router.get("/recent", response_model=List[MeetingOut])
async def list_recent(db: AsyncSession = Depends(get_db)):
    cache_key = KEY_MEETINGS_RECENT.format(user_id=settings.DEFAULT_USER_ID)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    meetings = await crud.get_recent_meetings(db, settings.DEFAULT_USER_ID)
    result = [MeetingOut.model_validate(m).model_dump(mode="json") for m in meetings]
    await cache.set(cache_key, result, ttl=TTL_MEETINGS_LIST)
    return result


# ---------------------------------------------------------------------------
# GET /api/meetings/{meeting_code}
# ---------------------------------------------------------------------------
@router.get("/{meeting_code}", response_model=MeetingDetail)
async def get_meeting(meeting_code: str, db: AsyncSession = Depends(get_db)):
    cache_key = KEY_MEETING.format(code=meeting_code)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    meeting = await crud.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    active = [p for p in meeting.participants if p.left_at is None]
    result = MeetingDetail(
        **MeetingOut.model_validate(meeting).model_dump(),
        host=meeting.host,  # type: ignore
        participant_count=len(active),
    ).model_dump(mode="json")

    await cache.set(cache_key, result, ttl=TTL_MEETING)
    return result


# ---------------------------------------------------------------------------
# POST /api/meetings/{meeting_code}/join
# ---------------------------------------------------------------------------
@router.post("/{meeting_code}/join", response_model=JoinResponse, status_code=status.HTTP_201_CREATED)
async def join_meeting(
    meeting_code: str,
    body: JoinRequest,
    db: AsyncSession = Depends(get_db),
):
    meeting = await crud.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.status == "ended":
        raise HTTPException(status_code=410, detail="Meeting has ended")

    is_host = meeting.host_id == settings.DEFAULT_USER_ID
    participant = await crud.add_participant(
        db,
        meeting=meeting,
        display_name=body.display_name,
        user_id=settings.DEFAULT_USER_ID,
        is_host=is_host,
    )
    await cache.delete(
        KEY_PARTICIPANTS.format(code=meeting_code),
        KEY_MEETING.format(code=meeting_code),
    )
    return JoinResponse(
        participant_id=participant.id,
        meeting_code=format_code(meeting.meeting_code),
        display_name=participant.display_name,
        is_host=participant.is_host,
    )


# ---------------------------------------------------------------------------
# POST /api/meetings/{meeting_code}/leave
# ---------------------------------------------------------------------------
@router.post("/{meeting_code}/leave", status_code=status.HTTP_200_OK)
async def leave_meeting(
    meeting_code: str,
    body: LeaveRequest,
    db: AsyncSession = Depends(get_db),
):
    participant = await crud.remove_participant(db, body.participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    await cache.delete(
        KEY_PARTICIPANTS.format(code=meeting_code),
        KEY_MEETING.format(code=meeting_code),
    )
    return {"left": True, "participant_id": body.participant_id}


# ---------------------------------------------------------------------------
# GET /api/meetings/{meeting_code}/participants
# ---------------------------------------------------------------------------
@router.get("/{meeting_code}/participants", response_model=List[ParticipantOut])
async def list_participants(meeting_code: str, db: AsyncSession = Depends(get_db)):
    cache_key = KEY_PARTICIPANTS.format(code=meeting_code)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    meeting = await crud.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    participants = await crud.get_active_participants(db, meeting.id)
    result = [ParticipantOut.model_validate(p).model_dump(mode="json") for p in participants]
    await cache.set(cache_key, result, ttl=TTL_PARTICIPANTS)
    return result


# ---------------------------------------------------------------------------
# POST /api/meetings/{meeting_code}/mute-all  (host control)
# ---------------------------------------------------------------------------
@router.post("/{meeting_code}/mute-all", response_model=MuteAllResponse)
async def mute_all(meeting_code: str, db: AsyncSession = Depends(get_db)):
    meeting = await crud.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    count = await crud.mute_all_participants(db, meeting.id)
    await cache.delete(
        KEY_PARTICIPANTS.format(code=meeting_code),
        KEY_MEETING.format(code=meeting_code),
    )
    return MuteAllResponse(muted_count=count)


# ---------------------------------------------------------------------------
# POST /api/meetings/{meeting_code}/remove/{participant_id}  (host control)
# ---------------------------------------------------------------------------
@router.post("/{meeting_code}/remove/{participant_id}", response_model=RemoveParticipantResponse)
async def remove_participant(
    meeting_code: str,
    participant_id: int,
    db: AsyncSession = Depends(get_db),
):
    meeting = await crud.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    removed = await crud.remove_participant_by_id(db, meeting.id, participant_id)
    await cache.delete(KEY_PARTICIPANTS.format(code=meeting_code))
    return RemoveParticipantResponse(removed=removed, participant_id=participant_id)

from __future__ import annotations

"""CRUD helpers — all DB operations live here, routers stay thin."""

from datetime import datetime, timezone
from typing import Optional, List, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ApiAuditLog, Meeting, MeetingHistory, MeetingStatus, MeetingType, Participant, User
from app.shorturl import generate_meeting_code, strip_dashes


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
async def get_user(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# API Audit Logging
# ---------------------------------------------------------------------------
async def log_api_audit(
    db: AsyncSession,
    action: str,
    meeting_code: str,
    meeting_type: str,
    invite_link: Optional[str] = None,
    client_ip: Optional[str] = None,
) -> ApiAuditLog:
    log = ApiAuditLog(
        action=action,
        meeting_code=meeting_code,
        meeting_type=meeting_type,
        invite_link=invite_link,
        client_ip=client_ip,
    )
    db.add(log)
    await db.flush()
    return log


async def get_api_audit_logs(db: AsyncSession, limit: int = 50) -> List[ApiAuditLog]:
    result = await db.execute(
        select(ApiAuditLog).order_by(ApiAuditLog.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Meeting — creation helpers
# ---------------------------------------------------------------------------
async def _unique_code(db: AsyncSession) -> str:
    for _ in range(10):
        code = generate_meeting_code()
        raw = strip_dashes(code)
        existing = await db.execute(
            select(Meeting).where(Meeting.meeting_code == raw)
        )
        if existing.scalar_one_or_none() is None:
            return raw
    raise RuntimeError("Failed to generate unique meeting code after 10 attempts")


async def create_instant_meeting(
    db: AsyncSession,
    host_id: int,
    base_url: str = "http://localhost:3000",
    client_ip: Optional[str] = None,
) -> Meeting:
    code_raw = await _unique_code(db)
    invite_link = f"{base_url}/join?code={code_raw}"

    meeting = Meeting(
        meeting_code=code_raw,
        title="Instant Meeting",
        host_id=host_id,
        type=MeetingType.instant,
        status=MeetingStatus.active,
        invite_link=invite_link,
    )
    db.add(meeting)

    await log_api_audit(
        db,
        action="create_instant_meeting",
        meeting_code=code_raw,
        meeting_type="instant",
        invite_link=invite_link,
        client_ip=client_ip,
    )

    await db.commit()
    await db.refresh(meeting)
    return meeting


async def create_scheduled_meeting(
    db: AsyncSession,
    host_id: int,
    title: str,
    description: Optional[str],
    scheduled_start: datetime,
    duration_minutes: int,
    base_url: str = "http://localhost:3000",
    client_ip: Optional[str] = None,
) -> Meeting:
    code_raw = await _unique_code(db)
    invite_link = f"{base_url}/join?code={code_raw}"

    meeting = Meeting(
        meeting_code=code_raw,
        title=title,
        description=description,
        host_id=host_id,
        type=MeetingType.scheduled,
        status=MeetingStatus.scheduled,
        scheduled_start=scheduled_start,
        duration_minutes=duration_minutes,
        invite_link=invite_link,
    )
    db.add(meeting)

    await log_api_audit(
        db,
        action="create_scheduled_meeting",
        meeting_code=code_raw,
        meeting_type="scheduled",
        invite_link=invite_link,
        client_ip=client_ip,
    )

    await db.commit()
    await db.refresh(meeting)
    return meeting


# ---------------------------------------------------------------------------
# Meeting — read helpers & history tracking
# ---------------------------------------------------------------------------
async def get_meeting_by_code(db: AsyncSession, meeting_code: str) -> Optional[Meeting]:
    raw = strip_dashes(meeting_code)
    result = await db.execute(
        select(Meeting)
        .where(Meeting.meeting_code == raw)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants))
    )
    return result.scalar_one_or_none()


async def get_upcoming_meetings(db: AsyncSession, user_id: int) -> List[Meeting]:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Meeting)
        .where(
            Meeting.host_id == user_id,
            Meeting.type == MeetingType.scheduled,
            Meeting.status == MeetingStatus.scheduled,
            Meeting.scheduled_start > now,
        )
        .options(selectinload(Meeting.host))
        .order_by(Meeting.scheduled_start.asc())
    )
    return list(result.scalars().all())


async def get_recent_meetings(db: AsyncSession, user_id: int) -> List[Meeting]:
    result = await db.execute(
        select(Meeting)
        .where(Meeting.host_id == user_id)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants))
        .order_by(Meeting.created_at.desc())
        .limit(30)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Participant helpers & duration tracking
# ---------------------------------------------------------------------------
async def add_participant(
    db: AsyncSession,
    meeting: Meeting,
    display_name: str,
    user_id: Optional[int] = None,
    is_host: bool = False,
) -> Participant:
    participant = Participant(
        meeting_id=meeting.id,
        display_name=display_name,
        user_id=user_id,
        is_host=is_host,
    )
    db.add(participant)

    if meeting.status != MeetingStatus.active:
        meeting.status = MeetingStatus.active

    if user_id:
        history = MeetingHistory(
            meeting_id=meeting.id,
            user_id=user_id,
            joined_at=datetime.now(timezone.utc),
        )
        db.add(history)

    await db.commit()
    await db.refresh(participant)
    return participant


async def remove_participant(
    db: AsyncSession, participant_id: int
) -> Optional[Participant]:
    result = await db.execute(
        select(Participant).where(Participant.id == participant_id)
    )
    participant = result.scalar_one_or_none()
    if not participant:
        return None

    now = datetime.now(timezone.utc)
    participant.left_at = now

    # Calculate meeting duration if no active participants remain
    active_remaining = await get_active_participants(db, participant.meeting_id)
    if len(active_remaining) <= 1:
        meeting_res = await db.execute(
            select(Meeting).where(Meeting.id == participant.meeting_id)
        )
        meeting = meeting_res.scalar_one_or_none()
        if meeting and meeting.status != MeetingStatus.ended:
            meeting.status = MeetingStatus.ended
            meeting.ended_at = now
            if meeting.created_at:
                delta = (now - meeting.created_at.replace(tzinfo=timezone.utc)).total_seconds()
                meeting.actual_duration_seconds = max(0, int(delta))

    await db.commit()
    return participant


async def get_active_participants(
    db: AsyncSession, meeting_id: int
) -> List[Participant]:
    result = await db.execute(
        select(Participant).where(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def mute_all_participants(
    db: AsyncSession, meeting_id: int
) -> int:
    result = await db.execute(
        update(Participant)
        .where(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
        )
        .values(is_muted=True)
        .returning(Participant.id)
    )
    await db.commit()
    return len(result.fetchall())


async def remove_participant_by_id(
    db: AsyncSession, meeting_id: int, participant_id: int
) -> bool:
    result = await db.execute(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
        )
    )
    participant = result.scalar_one_or_none()
    if not participant:
        return False
    participant.left_at = datetime.now(timezone.utc)
    await db.commit()
    return True

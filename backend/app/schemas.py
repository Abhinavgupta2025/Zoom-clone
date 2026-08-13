from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models import MeetingStatus, MeetingType


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class UserCreate(BaseModel):
    email: str
    name: Optional[str] = "User"


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Meeting
# ---------------------------------------------------------------------------
class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=1, le=1440)


class MeetingOut(BaseModel):
    id: int
    meeting_code: str
    title: str
    description: Optional[str] = None
    host_id: int
    type: MeetingType
    status: MeetingStatus
    scheduled_start: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    ended_at: Optional[datetime] = None
    actual_duration_seconds: Optional[int] = None
    invite_link: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MeetingDetail(MeetingOut):
    host: UserOut
    participant_count: int = 0


# ---------------------------------------------------------------------------
# Instant meeting
# ---------------------------------------------------------------------------
class InstantMeetingOut(BaseModel):
    meeting_code: str
    invite_link: str
    meeting: MeetingOut


# ---------------------------------------------------------------------------
# Participant
# ---------------------------------------------------------------------------
class JoinRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)


class JoinResponse(BaseModel):
    participant_id: int
    meeting_code: str
    display_name: str
    is_host: bool


class LeaveRequest(BaseModel):
    participant_id: int


class ParticipantOut(BaseModel):
    id: int
    display_name: str
    is_host: bool
    is_muted: bool
    joined_at: datetime
    left_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Schedule meeting
# ---------------------------------------------------------------------------
class ScheduleMeetingIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    scheduled_start: datetime
    duration_minutes: int = Field(60, ge=1, le=1440)


# ---------------------------------------------------------------------------
# Host controls
# ---------------------------------------------------------------------------
class MuteAllResponse(BaseModel):
    muted_count: int


class RemoveParticipantResponse(BaseModel):
    removed: bool
    participant_id: int


# ---------------------------------------------------------------------------
# API Audit Log History
# ---------------------------------------------------------------------------
class ApiAuditLogOut(BaseModel):
    id: int
    action: str
    meeting_code: str
    meeting_type: str
    invite_link: Optional[str] = None
    client_ip: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

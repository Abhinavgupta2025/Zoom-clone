from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class MeetingType(str, enum.Enum):
    instant = "instant"
    scheduled = "scheduled"


class MeetingStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    ended = "ended"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    meetings_hosted: Mapped[List[Meeting]] = relationship(
        "Meeting", back_populates="host"
    )
    participants: Mapped[List[Participant]] = relationship(
        "Participant", back_populates="user"
    )
    history: Mapped[List[MeetingHistory]] = relationship(
        "MeetingHistory", back_populates="user"
    )


# ---------------------------------------------------------------------------
# Meeting
# ---------------------------------------------------------------------------
class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    host_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    type: Mapped[MeetingType] = mapped_column(
        Enum(MeetingType), nullable=False, default=MeetingType.instant
    )
    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus), nullable=False, default=MeetingStatus.scheduled
    )
    scheduled_start: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    actual_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invite_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    host: Mapped[User] = relationship("User", back_populates="meetings_hosted")
    participants: Mapped[List[Participant]] = relationship(
        "Participant", back_populates="meeting", cascade="all, delete-orphan"
    )
    history: Mapped[List[MeetingHistory]] = relationship(
        "MeetingHistory", back_populates="meeting", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# Participant
# ---------------------------------------------------------------------------
class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_host: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    meeting: Mapped[Meeting] = relationship("Meeting", back_populates="participants")
    user: Mapped[Optional[User]] = relationship("User", back_populates="participants")


# ---------------------------------------------------------------------------
# MeetingHistory
# ---------------------------------------------------------------------------
class MeetingHistory(Base):
    __tablename__ = "meeting_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meeting_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meetings.id"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    meeting: Mapped[Meeting] = relationship("Meeting", back_populates="history")
    user: Mapped[User] = relationship("User", back_populates="history")


# ---------------------------------------------------------------------------
# ApiAuditLog (Stores API creation history & meeting audit logs)
# ---------------------------------------------------------------------------
class ApiAuditLog(Base):
    __tablename__ = "api_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    meeting_code: Mapped[str] = mapped_column(String(50), nullable=False)
    meeting_type: Mapped[str] = mapped_column(String(20), nullable=False)
    invite_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    client_ip: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

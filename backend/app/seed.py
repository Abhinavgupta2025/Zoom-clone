"""Seed the database with a default user + realistic sample meetings."""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, init_db
from app.models import Meeting, MeetingHistory, MeetingStatus, MeetingType, User
from app.shorturl import generate_meeting_code, strip_dashes


UPCOMING_MEETINGS = [
    {
        "title": "Weekly Standup",
        "description": "Engineering team sync — blockers, progress, plan for the week",
        "days_from_now": 1,
        "hour": 10,
        "duration_minutes": 30,
    },
    {
        "title": "Design Review",
        "description": "Review new onboarding flow designs with the product and design team",
        "days_from_now": 2,
        "hour": 14,
        "duration_minutes": 60,
    },
    {
        "title": "1:1 with Manager",
        "description": "Bi-weekly check-in — career growth and project priorities",
        "days_from_now": 3,
        "hour": 11,
        "duration_minutes": 45,
    },
    {
        "title": "Sprint Planning",
        "description": "Q3 Sprint 4 planning session — story points, assignments, goals",
        "days_from_now": 5,
        "hour": 9,
        "duration_minutes": 90,
    },
]

PAST_MEETINGS = [
    {
        "title": "Product Roadmap Q3",
        "description": "Reviewing Q3 goals and aligning on feature priorities",
        "days_ago": 2,
        "hour": 15,
        "duration_minutes": 60,
    },
    {
        "title": "Backend Architecture Discussion",
        "description": "Discussing microservices vs monolith for the new platform",
        "days_ago": 5,
        "hour": 13,
        "duration_minutes": 90,
    },
    {
        "title": "Incident Postmortem",
        "description": "Analysis of the June 30th outage — root cause and remediation",
        "days_ago": 7,
        "hour": 16,
        "duration_minutes": 45,
    },
    {
        "title": "New Employee Onboarding",
        "description": "Welcome session for three new engineers joining the team",
        "days_ago": 10,
        "hour": 10,
        "duration_minutes": 120,
    },
]


async def seed(db: AsyncSession) -> None:
    from sqlalchemy import select

    # Check if already seeded
    existing = await db.execute(select(User).where(User.id == 1))
    if existing.scalar_one_or_none():
        print("Database already seeded — skipping.")
        return

    # 1. Default user
    user = User(
        id=1,
        name="Default User",
        email="you@example.com",
        avatar_url="https://api.dicebear.com/7.x/avataaars/svg?seed=DefaultUser",
    )
    db.add(user)
    await db.flush()

    now = datetime.now(timezone.utc)
    base_url = "http://localhost:3000"

    # 2. Upcoming scheduled meetings
    for m in UPCOMING_MEETINGS:
        start = (now + timedelta(days=m["days_from_now"])).replace(
            hour=m["hour"], minute=0, second=0, microsecond=0
        )
        code_raw = strip_dashes(generate_meeting_code())
        meeting = Meeting(
            meeting_code=code_raw,
            title=m["title"],
            description=m["description"],
            host_id=1,
            type=MeetingType.scheduled,
            status=MeetingStatus.scheduled,
            scheduled_start=start,
            duration_minutes=m["duration_minutes"],
            invite_link=f"{base_url}/join?code={code_raw}",
        )
        db.add(meeting)

    # 3. Past meetings (ended)
    past_meetings_objs: list[Meeting] = []
    for m in PAST_MEETINGS:
        start = (now - timedelta(days=m["days_ago"])).replace(
            hour=m["hour"], minute=0, second=0, microsecond=0
        )
        code_raw = strip_dashes(generate_meeting_code())
        meeting = Meeting(
            meeting_code=code_raw,
            title=m["title"],
            description=m["description"],
            host_id=1,
            type=MeetingType.scheduled,
            status=MeetingStatus.ended,
            scheduled_start=start,
            duration_minutes=m["duration_minutes"],
            invite_link=f"{base_url}/join?code={code_raw}",
        )
        db.add(meeting)
        past_meetings_objs.append((meeting, m["days_ago"], start, m["duration_minutes"]))

    await db.flush()

    # 4. Meeting history entries for past meetings
    for meeting, days_ago, start, duration in past_meetings_objs:
        history = MeetingHistory(
            meeting_id=meeting.id,
            user_id=1,
            joined_at=start,
            duration_minutes=duration,
        )
        db.add(history)

    await db.commit()
    print("✅ Database seeded successfully.")


async def main() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())

export type MeetingType = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "active" | "ended";

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface Meeting {
  id: number;
  meeting_code: string;
  title: string;
  description?: string;
  host_id: number;
  type: MeetingType;
  status: MeetingStatus;
  scheduled_start?: string;
  duration_minutes?: number;
  ended_at?: string;
  actual_duration_seconds?: number;
  invite_link?: string;
  created_at: string;
}

export interface MeetingDetail extends Meeting {
  host: User;
  participant_count: number;
}

export interface InstantMeetingResponse {
  meeting_code: string;
  invite_link: string;
  meeting: Meeting;
}

export interface Participant {
  id: number;
  display_name: string;
  is_host: boolean;
  is_muted: boolean;
  joined_at?: string;
  left_at?: string;
}

export interface JoinResponse {
  participant_id: number;
  meeting_code: string;
  display_name: string;
  is_host: boolean;
}

export interface ScheduleMeetingPayload {
  title: string;
  description?: string;
  scheduled_start: string;
  duration_minutes: number;
}

export interface ApiAuditLog {
  id: number;
  action: string;
  meeting_code: string;
  meeting_type: string;
  invite_link?: string;
  client_ip?: string;
  created_at: string;
}

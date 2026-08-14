import {
  ApiAuditLog,
  AuthResponse,
  InstantMeetingResponse,
  JoinResponse,
  Meeting,
  MeetingDetail,
  Participant,
  ScheduleMeetingPayload,
  User,
  UserLoginPayload,
  UserSignUpPayload,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("zoom_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "An error occurred" }));
    throw new Error(errorData.detail || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  // Auth API
  signup: (payload: UserSignUpPayload): Promise<AuthResponse> => {
    return fetcher<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  login: (payload: UserLoginPayload): Promise<AuthResponse> => {
    return fetcher<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  guestLogin: (): Promise<AuthResponse> => {
    return fetcher<AuthResponse>("/api/auth/guest", {
      method: "POST",
    });
  },

  getMe: (): Promise<User> => {
    return fetcher<User>("/api/auth/me");
  },

  // Meetings API
  createInstantMeeting: (): Promise<InstantMeetingResponse> => {
    return fetcher<InstantMeetingResponse>("/api/meetings/instant", {
      method: "POST",
    });
  },

  scheduleMeeting: (payload: ScheduleMeetingPayload): Promise<Meeting> => {
    return fetcher<Meeting>("/api/meetings/schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getUpcomingMeetings: (): Promise<Meeting[]> => {
    return fetcher<Meeting[]>("/api/meetings/upcoming");
  },

  getRecentMeetings: (): Promise<Meeting[]> => {
    return fetcher<Meeting[]>("/api/meetings/recent");
  },

  getApiAuditLogs: (): Promise<ApiAuditLog[]> => {
    return fetcher<ApiAuditLog[]>("/api/meetings/audit-logs");
  },

  getMeeting: (code: string): Promise<MeetingDetail> => {
    return fetcher<MeetingDetail>(`/api/meetings/${code}`);
  },

  joinMeeting: (code: string, displayName: string): Promise<JoinResponse> => {
    return fetcher<JoinResponse>(`/api/meetings/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ display_name: displayName }),
    });
  },

  leaveMeeting: (code: string, participantId: number): Promise<{ left: boolean }> => {
    return fetcher<{ left: boolean }>(`/api/meetings/${code}/leave`, {
      method: "POST",
      body: JSON.stringify({ participant_id: participantId }),
    });
  },

  getParticipants: (code: string): Promise<Participant[]> => {
    return fetcher<Participant[]>(`/api/meetings/${code}/participants`);
  },

  muteAll: (code: string): Promise<{ muted_count: number }> => {
    return fetcher<{ muted_count: number }>(`/api/meetings/${code}/mute-all`, {
      method: "POST",
    });
  },

  removeParticipant: (code: string, participantId: number): Promise<{ removed: boolean }> => {
    return fetcher<{ removed: boolean }>(`/api/meetings/${code}/remove/${participantId}`, {
      method: "POST",
    });
  },
};

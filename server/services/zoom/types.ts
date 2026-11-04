/**
 * The part of Zoom Hadafi uses (after SAMA's integration): create a meeting,
 * register each learner who books so she gets her own join link, and read
 * back who attended. Everything talks to this interface, so tests and local
 * development run against an in-memory fake.
 */

export interface MeetingInput {
  topic: string;
  agenda?: string | null;
  startsAt: Date;
  /** IANA zone the event was scheduled in; Zoom shows it to the host. */
  timezone: string;
  /** Whole minutes; Zoom accepts 1–1440. */
  durationMinutes: number;
}

export interface ZoomMeeting {
  /** Zoom's numeric id as a string: it is too big for a JS number. */
  meetingId: string;
  /** The generic link. For admins only, never given to a learner. */
  joinUrl: string;
  passcode: string | null;
}

export interface ZoomRegistrant {
  registrantId: string;
  /** Hers alone: it's how Zoom knows who joined. */
  joinUrl: string;
}

export interface Person {
  email: string;
  firstName: string;
  lastName: string;
}

/** One stretch of time somebody was in the meeting. */
export interface ZoomSession {
  registrantId: string | null;
  name: string;
  email: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  durationSeconds: number;
}

export interface ZoomProvider {
  readonly kind: "s2s" | "mock";
  createMeeting(input: MeetingInput): Promise<ZoomMeeting>;
  updateMeeting(meetingId: string, input: MeetingInput): Promise<void>;
  deleteMeeting(meetingId: string): Promise<void>;
  /** Fetched when an admin asks, never stored: it grants host control. */
  getStartUrl(meetingId: string): Promise<string>;
  addRegistrant(meetingId: string, person: Person): Promise<ZoomRegistrant>;
  cancelRegistrant(meetingId: string, registrant: { registrantId: string; email: string }): Promise<void>;
  /** Attendance for a finished meeting, by instance UUID (or meeting id). Throws not_found until the report is ready. */
  listReportParticipants(meetingRef: string): Promise<ZoomSession[]>;
}

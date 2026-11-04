import { ZoomError } from "./errors";
import { zoomRequest } from "./http";
import type { MeetingInput, Person, ZoomMeeting, ZoomProvider, ZoomRegistrant, ZoomSession } from "./types";

/**
 * Zoom for real, over Server-to-Server OAuth (SAMA's settings).
 *
 * Start times go out as wall-clock time in the event's own zone, with that
 * `timezone` (SMEEP sends UAE time with Asia/Dubai; Hadafi events carry their
 * zone). Never an ISO string ending in Z *and* a timezone: Zoom then reads
 * the digits as local time and the meeting silently moves by hours.
 */

function wallClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}`;
}

function meetingBody(input: MeetingInput) {
  return {
    topic: input.topic.slice(0, 200),
    type: 2, // scheduled
    start_time: wallClock(input.startsAt, input.timezone),
    timezone: input.timezone,
    duration: Math.min(1440, Math.max(1, Math.round(input.durationMinutes))),
    agenda: (input.agenda ?? "").slice(0, 2000),
    settings: {
      // Auto-approved registration is what gives each registrant her own join link.
      approval_type: 0,
      registration_type: 1,
      // Hadafi sends its own confirmations and reminders.
      registrants_email_notification: false,
      registrants_confirmation_email: false,
      waiting_room: true,
      join_before_host: false,
      meeting_authentication: false,
      auto_recording: "none",
    },
  };
}

/** A meeting UUID containing "/" must be encoded twice in a path. */
function ref(id: string): string {
  const once = encodeURIComponent(id);
  return id.includes("/") ? encodeURIComponent(once) : once;
}

export class ZoomS2SAdapter implements ZoomProvider {
  readonly kind = "s2s" as const;

  private get host(): string {
    const host = process.env["ZOOM_HOST_USER_ID"];
    if (!host) throw new ZoomError("not_configured", "ZOOM_HOST_USER_ID is not set.");
    return encodeURIComponent(host);
  }

  async createMeeting(input: MeetingInput): Promise<ZoomMeeting> {
    const m = await zoomRequest<{ id?: number | string; join_url?: string; password?: string }>(`/users/${this.host}/meetings`, {
      method: "POST",
      body: meetingBody(input),
    });
    if (!m.id || !m.join_url) throw new ZoomError("validation", "Zoom created the meeting but returned no id or link.");
    return { meetingId: String(m.id), joinUrl: m.join_url, passcode: m.password || null };
  }

  async updateMeeting(meetingId: string, input: MeetingInput): Promise<void> {
    await zoomRequest(`/meetings/${ref(meetingId)}`, { method: "PATCH", body: meetingBody(input) });
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    await zoomRequest(`/meetings/${ref(meetingId)}`, { method: "DELETE", query: { schedule_for_reminder: "false" } });
  }

  async getStartUrl(meetingId: string): Promise<string> {
    const m = await zoomRequest<{ start_url?: string }>(`/meetings/${ref(meetingId)}`);
    if (!m.start_url) throw new ZoomError("not_found", "Zoom returned no host link for that meeting.");
    return m.start_url;
  }

  async addRegistrant(meetingId: string, person: Person): Promise<ZoomRegistrant> {
    const r = await zoomRequest<{ registrant_id?: string; id?: string; join_url?: string }>(`/meetings/${ref(meetingId)}/registrants`, {
      method: "POST",
      body: { email: person.email, first_name: person.firstName, last_name: person.lastName },
    });
    if (!r.join_url) throw new ZoomError("validation", "Zoom registered the learner but returned no join link.");
    return { registrantId: String(r.registrant_id ?? r.id ?? ""), joinUrl: r.join_url };
  }

  async cancelRegistrant(meetingId: string, registrant: { registrantId: string; email: string }): Promise<void> {
    await zoomRequest(`/meetings/${ref(meetingId)}/registrants/status`, {
      method: "PUT",
      body: { action: "cancel", registrants: [{ id: registrant.registrantId, email: registrant.email }] },
    });
  }

  async listReportParticipants(meetingRef: string): Promise<ZoomSession[]> {
    const all: ZoomSession[] = [];
    let token: string | undefined;
    do {
      const page = await zoomRequest<{
        participants?: { registrant_id?: string; name?: string; user_email?: string; join_time?: string; leave_time?: string; duration?: number }[];
        next_page_token?: string;
      }>(`/report/meetings/${ref(meetingRef)}/participants`, {
        query: { page_size: 300, include_fields: "registrant_id", next_page_token: token },
        timeoutMs: 30_000,
      });
      for (const p of page.participants ?? []) {
        const joinedAt = p.join_time ? new Date(p.join_time) : new Date(0);
        const leftAt = p.leave_time ? new Date(p.leave_time) : null;
        all.push({
          registrantId: p.registrant_id || null,
          name: p.name?.trim() || "Participant",
          email: p.user_email?.trim().toLowerCase() || null,
          joinedAt,
          leftAt,
          durationSeconds: typeof p.duration === "number" ? p.duration : leftAt ? Math.max(0, (leftAt.getTime() - joinedAt.getTime()) / 1000) : 0,
        });
      }
      token = page.next_page_token || undefined;
    } while (token);
    return all;
  }
}

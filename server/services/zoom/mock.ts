import { randomBytes, randomInt } from "node:crypto";
import { ZoomError } from "./errors";
import type { MeetingInput, Person, ZoomMeeting, ZoomProvider, ZoomRegistrant, ZoomSession } from "./types";

/**
 * An in-memory Zoom for development and tests, used whenever the Zoom
 * credentials aren't set (never in production). Links point at zoom.us but
 * lead nowhere.
 */
export class ZoomMockAdapter implements ZoomProvider {
  readonly kind = "mock" as const;
  readonly meetings = new Map<string, MeetingInput & { registrants: Map<string, Person & { registrantId: string }> }>();
  /** Tests set this to pretend a meeting happened. */
  readonly reports = new Map<string, ZoomSession[]>();
  /** Tests set this to make the next calls fail. */
  failNext: ZoomError | null = null;

  private check() {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
  }

  private find(meetingId: string) {
    const m = this.meetings.get(meetingId);
    if (!m) throw new ZoomError("not_found", "No such meeting.");
    return m;
  }

  async createMeeting(input: MeetingInput): Promise<ZoomMeeting> {
    this.check();
    const meetingId = String(randomInt(10_000_000, 99_999_999)) + String(randomInt(100, 999));
    this.meetings.set(meetingId, { ...input, registrants: new Map() });
    return { meetingId, joinUrl: `https://zoom.us/j/${meetingId}`, passcode: randomBytes(3).toString("hex") };
  }

  async updateMeeting(meetingId: string, input: MeetingInput): Promise<void> {
    this.check();
    Object.assign(this.find(meetingId), input);
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    this.check();
    this.meetings.delete(meetingId);
  }

  async getStartUrl(meetingId: string): Promise<string> {
    this.check();
    this.find(meetingId);
    return `https://zoom.us/s/${meetingId}?zak=mock`;
  }

  async addRegistrant(meetingId: string, person: Person): Promise<ZoomRegistrant> {
    this.check();
    const m = this.find(meetingId);
    const registrantId = randomBytes(8).toString("hex");
    m.registrants.set(registrantId, { ...person, registrantId });
    return { registrantId, joinUrl: `https://zoom.us/w/${meetingId}?tk=${registrantId}` };
  }

  async cancelRegistrant(meetingId: string, registrant: { registrantId: string }): Promise<void> {
    this.check();
    this.meetings.get(meetingId)?.registrants.delete(registrant.registrantId);
  }

  async listReportParticipants(meetingRef: string): Promise<ZoomSession[]> {
    this.check();
    const report = this.reports.get(meetingRef);
    if (!report) throw new ZoomError("not_found", "The report isn't ready.");
    return report;
  }
}

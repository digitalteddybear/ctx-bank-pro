import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { OutreachEngine } from "@/lib/server/outreach/engine";
import { FixtureModel } from "@/lib/server/outreach/models";
import { outreachStore } from "@/lib/server/outreach/store-instance";
import { queueCrmJob } from "@/lib/server/outreach/production-delivery";
import { deploymentSecret } from "@/lib/server/operator-session-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  triggerEvent: z.string(),
  payload: z.object({
    bookingId: z.union([z.string(), z.number()]),
    uid: z.string().min(1),
    startTime: z.string().datetime(),
    status: z.string(),
    requiresConfirmation: z.boolean().optional(),
    attendees: z.array(z.object({ email: z.string().email() }).passthrough()).min(1),
    metadata: z.object({ user_id: z.string().min(32).max(64) }).passthrough(),
  }).passthrough(),
}).passthrough();

function hasValidSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const secret = deploymentSecret("CAL_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "Cal webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 64_000) return Response.json({ error: "Payload too large." }, { status: 413 });
  if (!hasValidSignature(raw, request.headers.get("x-cal-signature-256"), secret)) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let parsed: z.infer<typeof eventSchema>;
  try { parsed = eventSchema.parse(JSON.parse(raw)); }
  catch { return Response.json({ error: "Invalid Cal booking payload." }, { status: 400 }); }
  const isCreated = parsed.triggerEvent === "BOOKING_CREATED";
  const isCancelled = parsed.triggerEvent === "BOOKING_CANCELLED";
  if (!isCreated && !isCancelled) return Response.json({ ok: true, ignored: true });
  if (isCreated && (parsed.payload.status !== "ACCEPTED" || parsed.payload.requiresConfirmation === true)) {
    return Response.json({ ok: true, pendingConfirmation: true }, { status: 202 });
  }

  const store = outreachStore();
  store.db.exec("CREATE TABLE IF NOT EXISTS booking_references(ref_hash TEXT PRIMARY KEY,run_id TEXT NOT NULL,created_at INTEGER NOT NULL,consumed_at INTEGER)");
  const referenceHash = createHash("sha256").update(parsed.payload.metadata.user_id).digest("hex");
  return store.transaction(() => {
    const reference = store.db.prepare("SELECT run_id,consumed_at FROM booking_references WHERE ref_hash=?").get(referenceHash);
    if (!reference) return Response.json({ error: "Booking reference was not issued by CTX." }, { status: 404 });

    let run;
    try { run = store.get(String(reference.run_id)); }
    catch { return Response.json({ error: "Outreach run not found." }, { status: 404 }); }
    if (!parsed.payload.attendees.some(attendee => attendee.email.toLowerCase() === run.prospect.email.toLowerCase())) {
      return Response.json({ error: "Booking attendee does not match the linked contact." }, { status: 409 });
    }

    const contactId = run.prospect.id.startsWith("lead-") ? run.prospect.id.slice("lead-".length) : "";
    if (isCreated && reference.consumed_at) {
      if (run.booking?.id !== String(parsed.payload.bookingId)) return Response.json({error:"Booking reference already used."},{status:409});
      return Response.json({ok:true,duplicate:true});
    }
    if (isCancelled) {
      if (run.booking?.id === String(parsed.payload.bookingId) && run.booking.status === "cancelled") {
        return Response.json({ ok: true, duplicate: true });
      }
      if (!run.booking || run.booking.id !== String(parsed.payload.bookingId)) {
        return Response.json({error:"Cancellation does not match the current booking."},{status:409});
      }
      const eventId = `cal-cancel-${parsed.payload.uid}`;
      try {
        new OutreachEngine(store, new FixtureModel()).booking(run.id, {
          eventId,
          bookingId: String(parsed.payload.bookingId),
          sequence: (run.booking?.sequence ?? 1) + 1,
          startsAt: parsed.payload.startTime,
          status: "cancelled",
        });
      } catch {
        return Response.json({ error: "Could not cancel booking on the outreach run." }, { status: 409 });
      }
      const crmNote = !contactId ? "unavailable" : process.env.HUBSPOT_WRITES_ENABLED === "true" ? "queued" : "dry_run";
      if (crmNote === "queued") {
        queueCrmJob(store, eventId + ":briefing", run.id, "briefing", {
          hubspotId: contactId, email: run.prospect.email, messageId: eventId,
          stage: "Call cancelled", evidenceSource: "Cal.com",
          prospectQuote: `Cancellation received for booking ${parsed.payload.bookingId} scheduled for ${parsed.payload.startTime}.`,
          agentBrief: "The meeting was cancelled. Follow-up requires operator review.",
          talkingPoints: ["Review the cancellation.", "Check for an existing replacement booking.", "Check contact preferences before following up."],
        });
      }
      store.event(run.id, "cal_booking_cancelled", { eventId, bookingId: String(parsed.payload.bookingId), crmNote });
      return Response.json({ ok: true, bookingId: String(parsed.payload.bookingId), status: "cancelled" });
    }

    const alreadyConfirmed = run.booking?.id === String(parsed.payload.bookingId) && run.booking.status === "confirmed";
    if (!alreadyConfirmed && run.status !== "booking_pending") return Response.json({ error: "Run is not awaiting a booking." }, { status: 409 });

    const eventId = `cal-${parsed.payload.uid}`;
    try {
      if (!alreadyConfirmed) new OutreachEngine(store, new FixtureModel()).booking(run.id, {
        eventId,
        bookingId: String(parsed.payload.bookingId),
        sequence: 1,
        startsAt: parsed.payload.startTime,
        status: "confirmed",
      });
    } catch {
      return Response.json({ error: "Could not reconcile booking with the outreach run." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const queueCrm = Boolean(contactId) && process.env.HUBSPOT_WRITES_ENABLED === "true";
    if (queueCrm) {
      queueCrmJob(store, eventId + ":status", run.id, "status", {
      hubspotId: contactId,
      email: run.prospect.email,
      messageId: `cal-status-${parsed.payload.uid}`,
      approvedBy: "cal_webhook",
      properties: { ctx_status: "Booked", ctx_last_contact: now, ctx_booking_link_sent: true },
      });
      queueCrmJob(store, eventId + ":briefing", run.id, "briefing", {
      hubspotId: contactId,
      email: run.prospect.email,
      messageId: `cal-note-${parsed.payload.uid}`,
      stage: "Call booked", evidenceSource: "Cal.com",
      prospectQuote: `Booking confirmed for ${parsed.payload.startTime}.`,
      agentBrief: "Cal.com confirmed the booking. Google Calendar remains the meeting record; CTX did not create a meeting.",
      talkingPoints: ["Confirm the prospect’s stated objective.", "Use only approved, evidence-backed information.", "Keep ASP’s capital introducer and liaison role clear."],
      });
    }
    const crmState = !contactId ? "unavailable" : queueCrm ? "queued" : "dry_run";

    const current = store.db.prepare("SELECT consumed_at FROM booking_references WHERE ref_hash=?").get(referenceHash);
    if (current && !current.consumed_at) store.db.prepare("UPDATE booking_references SET consumed_at=? WHERE ref_hash=? AND consumed_at IS NULL").run(Date.now(), referenceHash);
    store.event(run.id, "cal_booking_reconciled", {
      eventId,
      bookingId: String(parsed.payload.bookingId),
      crmStatus: crmState,
      crmNote: crmState,
      externalCrmWrite: false,
    });
    return Response.json({ ok: true, bookingId: String(parsed.payload.bookingId), crmStatus: crmState, crmNote: crmState });
  });
}

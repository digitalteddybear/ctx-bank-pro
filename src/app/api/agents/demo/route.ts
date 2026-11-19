import { NextRequest } from "next/server";
import { z } from "zod";
import { hasLocalWorkspaceAccess } from "@/lib/server/local-workspace-auth";
import {
  getDemoStatus,
  getDemoRunStatus,
  startInteractiveDemo,
  clearInteractiveDemoRun,
  checkInboundDemoReply,
  simulateInboundDemoReply,
  confirmMeetingBooking,
} from "@/lib/server/outreach/demo-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const demoActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    liveSend: z.boolean().default(false),
    liveCrm: z.boolean().default(false),
    useLiveModel: z.boolean().optional(),
    prospectName: z.string().min(1).max(200).optional(),
    prospectEmail: z.string().email().optional(),
    hubspotContactId: z.string().min(1).max(50).optional(),
    customSubject: z.string().min(1).max(200).optional(),
    customBody: z.string().min(1).max(10000).optional(),
    replyHtmlTemplate: z.string().max(20000).optional(),
  }),
  z.object({
    action: z.literal("reset-run"),
    runId: z.string().min(1),
  }),
  z.object({
    action: z.literal("check-reply"),
    runId: z.string().min(1),
    liveSend: z.boolean().optional(),
    liveCrm: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("simulate-reply"),
    runId: z.string().min(1),
    text: z.string().min(1).max(8000),
    liveSend: z.boolean().optional(),
    liveCrm: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("check-booking"),
    runId: z.string().min(1),
    liveCrm: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("confirm-booking"),
    runId: z.string().min(1),
    liveCrm: z.boolean().optional(),
    startsAt: z.string().optional(),
  }),
]);

export async function GET(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) {
    return Response.json({ error: "Operator access required." }, { status: 401 });
  }

  try {
    const status = getDemoStatus();
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load demo status." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!hasLocalWorkspaceAccess(request)) {
    return Response.json({ error: "Operator access required." }, { status: 401 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 256000) {
    return Response.json({ error: "Request payload too large." }, { status: 413 });
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON format." }, { status: 400 });
  }

  const parsed = demoActionSchema.safeParse(value);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid demo command payload.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const cmd = parsed.data;

  try {
    if (cmd.action === "start") {
      const result = await startInteractiveDemo({
        liveSend: cmd.liveSend,
        liveCrm: cmd.liveCrm,
        useLiveModel: cmd.useLiveModel,
        prospectName: cmd.prospectName,
        prospectEmail: cmd.prospectEmail,
        hubspotContactId: cmd.hubspotContactId,
        customSubject: cmd.customSubject,
        customBody: cmd.customBody,
        replyHtmlTemplate: cmd.replyHtmlTemplate,
      });
      return Response.json(result, { status: 201 });
    }

    if (cmd.action === "reset-run") {
      return Response.json(clearInteractiveDemoRun(cmd.runId));
    }

    if (cmd.action === "check-reply") {
      const result = await checkInboundDemoReply(cmd.runId, {
        liveSend: cmd.liveSend,
        liveCrm: cmd.liveCrm,
      });
      return Response.json(result, { status: 200 });
    }

    if (cmd.action === "simulate-reply") {
      const result = await simulateInboundDemoReply(cmd.runId, cmd.text, {
        liveSend: cmd.liveSend,
        liveCrm: cmd.liveCrm,
      });
      return Response.json(result, { status: 200 });
    }

    if (cmd.action === "confirm-booking") {
      const result = await confirmMeetingBooking(cmd.runId, {
        liveCrm: cmd.liveCrm,
        startsAt: cmd.startsAt,
      });
      return Response.json(result, { status: 200 });
    }

    if (cmd.action === "check-booking") {
      const result = await getDemoRunStatus(cmd.runId, cmd.liveCrm);
      return Response.json(result, { status: 200 });
    }

    return Response.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Demo execution failed." },
      { status: 500 }
    );
  }
}

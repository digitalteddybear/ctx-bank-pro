import { outreachStore } from "@/lib/server/outreach/store-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const row = outreachStore().db.prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
    if (row?.ok !== 1) {
      return Response.json({ status: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

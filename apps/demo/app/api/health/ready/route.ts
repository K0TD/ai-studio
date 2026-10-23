import { pool } from "@/lib/db";
export const GET = async () => {
  try {
    const ready = await pool.query(
      "select exists(select 1 from syntx_worker_heartbeats where updated_at > now() - interval '90 seconds') as worker"
    );
    const isWorkerReady = Boolean(ready.rows[0]?.worker);
    return Response.json(
      { status: isWorkerReady ? "ready" : "waiting_for_worker" },
      {
        headers: { "Cache-Control": "no-store" },
        status: isWorkerReady ? 200 : 503,
      }
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
};

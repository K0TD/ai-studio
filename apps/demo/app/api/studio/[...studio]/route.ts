const retired = () =>
  Response.json(
    { code: "LEGACY_API_RETIRED", error: "Старый API Studio отключен" },
    { headers: { "Cache-Control": "no-store" }, status: 410 }
  );
export const GET = retired;
export const POST = retired;
export const DELETE = retired;

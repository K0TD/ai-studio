export const GET = () =>
  Response.json(
    { status: "alive" },
    { headers: { "Cache-Control": "no-store" } }
  );

import { getSession } from "@/lib/session";

export async function GET() {
  const user = await getSession();
  return Response.json(
    { user: user && { name: user.name, slackId: user.slackId } },
    { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
}

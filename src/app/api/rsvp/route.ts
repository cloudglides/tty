import { connection } from "next/server";
import { rsvpStore } from "@/lib/rsvp-store";
import { getSession } from "@/lib/session";
import { inviteToChannel, slackConfig } from "@/lib/slack";

const noStore = { "Cache-Control": "no-store" };

/** Whether the logged-in user has RSVPed. */
export async function GET() {
  await connection();
  const user = await getSession();
  if (!user) return Response.json({ error: "not logged in" }, { status: 401, headers: noStore });

  const rsvp = await rsvpStore.get(user.slackId);
  return Response.json({ rsvp: rsvp && { at: rsvp.at }, count: await rsvpStore.count() }, { headers: noStore });
}

/** RSVP, then add them to #tty. Safe to repeat: re-running retries the Slack invite. */
export async function POST() {
  const user = await getSession();
  if (!user) return Response.json({ error: "not logged in" }, { status: 401, headers: noStore });

  const { rsvp, created } = await rsvpStore.add({ slackId: user.slackId, name: user.name, sub: user.sub });
  const slack = await inviteToChannel(user.slackId);
  const channel = slackConfig()?.channel;

  return Response.json(
    {
      created,
      at: rsvp.at,
      slack,
      channelUrl: channel ? `https://hackclub.slack.com/archives/${channel}` : null,
    },
    { headers: noStore },
  );
}

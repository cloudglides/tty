export type InviteResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: string };

export function slackConfig() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  return token && channel ? { token, channel } : null;
}

const REASONS: Record<string, string> = {
  user_is_restricted: "guest accounts can't be added to channels automatically",
  ura_max_channels: "guest accounts can't join more channels",
  user_not_found: "your Slack account wasn't found",
  not_in_channel: "the bot isn't in the channel yet",
  channel_not_found: "the channel wasn't found",
  is_archived: "the channel is archived",
};

export async function inviteToChannel(slackId: string): Promise<InviteResult> {
  const config = slackConfig();
  if (!config) return { ok: false, reason: "Slack isn't set up on this server" };

  try {
    const res = await fetch("https://slack.com/api/conversations.invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: config.channel, users: slackId }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; errors?: { error: string }[] };
    if (data.ok) return { ok: true, already: false };

    const error = data.errors?.[0]?.error ?? data.error ?? `HTTP ${res.status}`;
    if (error === "already_in_channel") return { ok: true, already: true };
    console.error("slack conversations.invite failed:", error);
    return { ok: false, reason: REASONS[error] ?? "Slack returned an error" };
  } catch (err) {
    console.error("slack conversations.invite failed:", err);
    return { ok: false, reason: "couldn't reach Slack" };
  }
}

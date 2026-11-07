import { connection } from "next/server";
import { chatHub } from "@/lib/chat-hub";
import type { ChatEvent } from "@/lib/chat-types";
import { getSession } from "@/lib/session";

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  await connection();
  const user = await getSession();
  if (!user) return Response.json({ error: "not logged in" }, { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const send = (event: ChatEvent) => write(`data: ${JSON.stringify(event)}\n\n`);

      const conn = chatHub.join(user, send);
      if (typeof conn === "string") {
        write(`event: refused\ndata: ${JSON.stringify({ error: conn })}\n\n`);
        controller.close();
        return;
      }

      const heartbeat = setInterval(() => {
        try {
          write(": ping\n\n");
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        chatHub.leave(conn.id);
        try {
          controller.close();
        } catch {
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "not logged in" }, { status: 401 });

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.text !== "string") return Response.json({ error: "expected text" }, { status: 400 });

  const error = chatHub.say(user, body.text);
  return Response.json(error ? { error } : { ok: true }, { status: error ? 400 : 200 });
}

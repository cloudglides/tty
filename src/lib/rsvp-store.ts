import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * RSVPs, persisted to data/rsvps.json. Server-only.
 * Like the chat hub, this assumes one long-running server instance.
 */

export type Rsvp = { slackId: string; name: string; sub: string; at: string };

const FILE = path.join(process.cwd(), "data", "rsvps.json");

class RsvpStore {
  private rsvps: Map<string, Rsvp> | null = null;
  /** Serializes loads and writes so concurrent requests can't clobber the file. */
  private queue: Promise<unknown> = Promise.resolve();

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  private async load() {
    if (this.rsvps) return this.rsvps;
    try {
      const list = JSON.parse(await readFile(FILE, "utf8")) as Rsvp[];
      this.rsvps = new Map(list.map((r) => [r.slackId, r]));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.rsvps = new Map();
    }
    return this.rsvps;
  }

  get(slackId: string) {
    return this.run(async () => (await this.load()).get(slackId) ?? null);
  }

  /** Records an RSVP. Returns the existing one if this person already RSVPed. */
  add(rsvp: Omit<Rsvp, "at">) {
    return this.run(async () => {
      const rsvps = await this.load();
      const existing = rsvps.get(rsvp.slackId);
      if (existing) return { rsvp: existing, created: false };

      const record = { ...rsvp, at: new Date().toISOString() };
      const list = [...rsvps.values(), record];
      await mkdir(path.dirname(FILE), { recursive: true });
      // write-then-rename so a crash mid-write never leaves a half-written file
      await writeFile(`${FILE}.tmp`, JSON.stringify(list, null, 2));
      await rename(`${FILE}.tmp`, FILE);
      rsvps.set(record.slackId, record);
      return { rsvp: record, created: true };
    });
  }

  count() {
    return this.run(async () => (await this.load()).size);
  }
}

const g = globalThis as typeof globalThis & { __ttyRsvps?: RsvpStore };
export const rsvpStore = (g.__ttyRsvps ??= new RsvpStore());

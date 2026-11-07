import { Pool } from "pg";

export type Rsvp = { slackId: string; name: string; sub: string; at: string };

type Row = { slack_id: string; name: string; sub: string; at: Date };

const toRsvp = (r: Row): Rsvp => ({ slackId: r.slack_id, name: r.name, sub: r.sub, at: r.at.toISOString() });

class RsvpStore {
  private pool: Pool | null = null;
  private ready: Promise<void> | null = null;

  private db() {
    if (!this.pool) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not set");
      this.pool = new Pool({ connectionString, max: 5 });
    }
    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS rsvps (
          slack_id text PRIMARY KEY,
          name text NOT NULL,
          sub text NOT NULL,
          at timestamptz NOT NULL DEFAULT now()
        )`,
      )
      .then(() => {})
      .catch((err) => {
        this.ready = null;
        throw err;
      });
    return this.ready.then(() => this.pool!);
  }

  async get(slackId: string) {
    const { rows } = await (await this.db()).query<Row>("SELECT * FROM rsvps WHERE slack_id = $1", [slackId]);
    return rows[0] ? toRsvp(rows[0]) : null;
  }

  async add(rsvp: Omit<Rsvp, "at">) {
    const db = await this.db();
    const inserted = await db.query<Row>(
      "INSERT INTO rsvps (slack_id, name, sub) VALUES ($1, $2, $3) ON CONFLICT (slack_id) DO NOTHING RETURNING *",
      [rsvp.slackId, rsvp.name, rsvp.sub],
    );
    if (inserted.rows[0]) return { rsvp: toRsvp(inserted.rows[0]), created: true };
    return { rsvp: (await this.get(rsvp.slackId))!, created: false };
  }

  async count() {
    const { rows } = await (await this.db()).query<{ n: number }>("SELECT count(*)::int AS n FROM rsvps");
    return rows[0].n;
  }
}

const g = globalThis as typeof globalThis & { __ttyRsvpsPg?: RsvpStore };
export const rsvpStore = (g.__ttyRsvpsPg ??= new RsvpStore());

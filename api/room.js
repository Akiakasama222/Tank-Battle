// Serverless room API for Vercel + Neon Postgres (DATABASE_URL is injected by the Neon integration).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from({ length: n }, () => A[(Math.random() * A.length) | 0]).join('');

let ready;
const init = () => (ready ??= sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS rooms(code text PRIMARY KEY, seed text NOT NULL, pin text NOT NULL DEFAULT '',
        round int NOT NULL DEFAULT 0, next_pid int NOT NULL DEFAULT 1, exp timestamptz NOT NULL)`,
  sql`CREATE TABLE IF NOT EXISTS players(code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, pid int NOT NULL,
        state jsonb NOT NULL, ts timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(code, pid))`,
]).catch((e) => { ready = null; throw e; }));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  const c = String(b.code || '').toUpperCase().slice(0, 5);
  try {
    await init();
    if (b.op === 'create') {
      await sql`DELETE FROM rooms WHERE exp < now()`;
      for (let i = 0; i < 5; i++) {
        const k = rand(5), seed = rand(8);
        const r = await sql`INSERT INTO rooms(code, seed, pin, exp) VALUES (${k}, ${seed}, ${String(b.pin || '').slice(0, 12)}, now() + interval '2 hours')
                            ON CONFLICT DO NOTHING RETURNING code`;
        if (r.length) return res.json({ code: k, pid: 0, seed, round: 0 });
      }
      return res.status(503).json({ error: 'Try again' });
    }
    if (b.op === 'sync') {
      const pid = Math.max(0, Math.min(1e6, b.pid | 0));
      const state = JSON.stringify(b.state || {});
      if (state.length > 4000) return res.status(400).json({ error: 'Bad request' });
      const r = await sql.transaction([
        sql`UPDATE rooms SET exp = now() + interval '2 hours' WHERE code = ${c} AND exp < now() + interval '115 minutes'`,
        sql`INSERT INTO players(code, pid, state, ts) SELECT ${c}, ${pid}, ${state}::jsonb, now()
            WHERE EXISTS (SELECT 1 FROM rooms WHERE code = ${c})
            ON CONFLICT (code, pid) DO UPDATE SET state = EXCLUDED.state, ts = now()`,
        sql`SELECT round, seed FROM rooms WHERE code = ${c} AND exp > now()`,
        sql`SELECT pid, state AS s FROM players WHERE code = ${c} AND pid <> ${pid} AND ts > now() - interval '20 seconds'`,
      ]);
      if (!r[2].length) return res.status(404).json({ error: 'Room expired' });
      return res.json({ round: r[2][0].round, seed: r[2][0].seed, others: r[3] });
    }
    if (b.op === 'join') { // unlimited players: every join gets the next free id
      const r = await sql`UPDATE rooms SET next_pid = next_pid + 1 WHERE code = ${c} AND exp > now()
                          RETURNING next_pid - 1 AS pid, seed, round`;
      if (!r.length) return res.status(404).json({ error: 'Room not found' });
      return res.json({ code: c, ...r[0] });
    }
    if (b.op === 'reset') {
      const r = await sql`SELECT pin FROM rooms WHERE code = ${c} AND exp > now()`;
      if (!r.length) return res.status(404).json({ error: 'Room not found' });
      if (r[0].pin && r[0].pin !== String(b.pin || '')) return res.status(403).json({ error: 'Wrong referee PIN' });
      await sql.transaction([
        sql`UPDATE rooms SET round = round + 1, seed = ${rand(8)} WHERE code = ${c}`,
        sql`DELETE FROM players WHERE code = ${c}`,
      ]);
      return res.json({ ok: 1 });
    }
    return res.status(400).json({ error: 'Bad request' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}

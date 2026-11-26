import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";

/**
 * Server-Sent Events hub. Each signed-in browser tab keeps one `GET /api/events`
 * connection open; the API pushes small events down it so pages update live.
 *
 * Connections are kept in this process's memory. If the API is ever run as more
 * than one instance, swap `publish` for Postgres LISTEN/NOTIFY or Redis pub/sub.
 */

export type RealtimeEvent =
  /** A new row in the user's notifications. Payload: the notice. */
  | "notification"
  /** Leave requests changed; pages showing leave should re-fetch. */
  | "leave";

const clients = new Map<string, Set<Response>>();
const HEARTBEAT_MS = 25_000;

export function subscribe(req: Request, res: Response) {
  const userId = req.user!.id;
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop nginx from buffering the stream
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n"); // browser reconnect delay after a drop

  let set = clients.get(userId);
  if (!set) clients.set(userId, (set = new Set()));
  set.add(res);

  // Proxies and load balancers close idle connections; a comment line keeps it open.
  const beat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(beat);
    set!.delete(res);
    if (!set!.size) clients.delete(userId);
  });
}

export function publish(userIds: Iterable<string>, event: RealtimeEvent, data: unknown = {}) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const id of new Set(userIds)) for (const res of clients.get(id) ?? []) res.write(frame);
}

/** Login ids of every admin and superadmin. */
export async function adminUserIds(): Promise<string[]> {
  const r = await pool.query<{ id: string }>("select id from users where role in ('superadmin','admin')");
  return r.rows.map((x) => x.id);
}

/** Login ids linked to an employee record (normally one). */
export async function employeeUserIds(employeeId: string): Promise<string[]> {
  const r = await pool.query<{ id: string }>("select id from users where employee_id=$1", [employeeId]);
  return r.rows.map((x) => x.id);
}

/** Stores a notification for each user and pushes it to their open tabs. */
export async function notify(userIds: string[], n: { title: string; body: string; link?: string }) {
  for (const userId of new Set(userIds)) {
    const r = await pool.query(
      `insert into notices (id,user_id,title,body,link) values ($1,$2,$3,$4,$5) returning id,title,body,link,at,read`,
      [randomUUID(), userId, n.title, n.body, n.link ?? null],
    );
    publish([userId], "notification", r.rows[0]);
  }
}

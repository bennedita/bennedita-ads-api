import { sql } from "./_lib/db.js";

/**
 * Bennedita Ads API (single function to avoid Vercel Hobby limit)
 *
 * Routes:
 * - GET  /api/health
 * - GET  /api/reports?client_id=&google_customer_id=&period=&status=&limit=&offset=
 * - GET  /api/reports/:id
 * - POST /api/reports
 * - PATCH /api/reports/:id
 * - PATCH /api/reports/:id/status
 *
 * Auth (optional):
 * If you set env INTERNAL_API_KEY on Vercel, write routes require header:
 *   x-internal-api-key: <value>
 */
function json(res, status, payload) {
  return res.status(status).json(payload);
}

function getUrl(req) {
  return new URL(req.url, `http://${req.headers.host}`);
}

async function readJsonBody(req) {
  try {
    if (!req.body) return {};
    if (typeof req.body === "object") return req.body;
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function requireInternalKeyIfConfigured(req, res) {
  const required = process.env.INTERNAL_API_KEY;
  if (!required) return true; // no auth configured
  const provided = req.headers["x-internal-api-key"];
  if (!provided || provided !== required) {
    json(res, 401, { success: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function toInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  const url = getUrl(req);
  const path = url.pathname; // e.g. /api/reports/123
  const method = req.method;

  // Basic CORS (optional; helps if frontend hits API directly)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-internal-api-key");
  if (method === "OPTIONS") return res.status(204).end();

  try {
    // -----------------------
    // GET /api/health
    // -----------------------
    if (method === "GET" && path === "/api/health") {
      return json(res, 200, { success: true, status: "ok" });
    }

    // -----------------------
    // GET /api/reports (list)
    // -----------------------
    if (method === "GET" && path === "/api/reports") {
      const limit = Math.min(toInt(url.searchParams.get("limit"), 20), 100);
      const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

      const client_id = url.searchParams.get("client_id");
      const google_customer_id = url.searchParams.get("google_customer_id");
      const period = url.searchParams.get("period");
      const status = url.searchParams.get("status");

      const where = [];
      if (client_id) where.push(sql`r.client_id = ${client_id}::uuid`);
      if (google_customer_id) where.push(sql`c.google_customer_id = ${google_customer_id}`);
      if (period) where.push(sql`r.period = ${period}`);
      if (status) where.push(sql`r.status = ${status}`);

      let items;

if (!client_id && !google_customer_id && !period && !status) {

  items = await sql`
    SELECT
      r.id,
      r.client_id,
      c.name AS client_name,
      c.google_customer_id,
      r.period,
      r.summary,
      r.next_actions,
      r.snapshot_json,
      r.status,
      r.created_at
    FROM reports r
    JOIN clients c ON c.id = r.client_id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

} else {

  items = await sql`
    SELECT
      r.id,
      r.client_id,
      c.name AS client_name,
      c.google_customer_id,
      r.period,
      r.summary,
      r.next_actions,
      r.snapshot_json,
      r.status,
      r.created_at
    FROM reports r
    JOIN clients c ON c.id = r.client_id
    WHERE
      (${client_id}::uuid IS NULL OR r.client_id = ${client_id}::uuid)
      AND (${google_customer_id} IS NULL OR c.google_customer_id = ${google_customer_id})
      AND (${period} IS NULL OR r.period = ${period})
      AND (${status} IS NULL OR r.status = ${status})
    ORDER BY r.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

}

      const totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM reports r
        JOIN clients c ON c.id = r.client_id
      `;

      const total = totalRows?.[0]?.total ?? 0;

      return json(res, 200, {
        success: true,
        data: {
          items,
          pagination: { limit, offset, total },
        },
      });
    }

    // -----------------------
     
    // -----------------------
    // POST /api/reports (create)
    // -----------------------
    if (method === "POST" && path === "/api/reports") {
      if (!requireInternalKeyIfConfigured(req, res)) return;

      const body = await readJsonBody(req);
      if (body === null) {
        return json(res, 400, { success: false, error: "Invalid JSON body" });
      }

      const {
        client_name,
        google_customer_id,
        period,
        summary = "",
        next_actions = "",
        snapshot_json = {},
        status = "rascunho",
      } = body;

      if (!client_name || !google_customer_id || !period) {
        return json(res, 400, {
          success: false,
          error: "Missing required fields: client_name, google_customer_id, period",
        });
      }

      // Upsert client by google_customer_id
      const clientRows = await sql`
        SELECT id
        FROM clients
        WHERE google_customer_id = ${google_customer_id}
        LIMIT 1
      `;

      let clientId;
      if (clientRows && clientRows.length > 0) {
        clientId = clientRows[0].id;

        // Keep name updated (optional)
        await sql`
          UPDATE clients
          SET name = ${client_name}
          WHERE id = ${clientId}::uuid
        `;
      } else {
        const inserted = await sql`
          INSERT INTO clients (name, google_customer_id)
          VALUES (${client_name}, ${google_customer_id})
          RETURNING id
        `;
        clientId = inserted[0].id;
      }

      const reportRows = await sql`
        INSERT INTO reports (
          client_id,
          period,
          summary,
          next_actions,
          snapshot_json,
          status
        )
        VALUES (
          ${clientId}::uuid,
          ${period},
          ${summary},
          ${next_actions},
          ${snapshot_json}::jsonb,
          ${status}
        )
        RETURNING
          id,
          client_id,
          period,
          summary,
          next_actions,
          snapshot_json,
          status,
          created_at
      `;

      return json(res, 201, { success: true, data: reportRows[0] });
    }
// -----------------------
// GET /api/reports/:id
// -----------------------
if (method === "GET" && path.startsWith("/api/reports/") && path.split("/").length === 4) {

  const parts = path.split("/").filter(Boolean);

  if (parts.length === 3) {

    const id = parts[2];

    const rows = await sql`
      SELECT
        r.id,
        r.client_id,
        c.name AS client_name,
        c.google_customer_id,
        r.period,
        r.summary,
        r.next_actions,
        r.snapshot_json,
        r.status,
        r.created_at
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      WHERE r.id = ${id}::uuid
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return json(res, 404, { success: false, error: "Report not found" });
    }

    return json(res, 200, { success: true, data: rows[0] });

  }
}
    // -----------------------
    // PATCH /api/reports/:id (update)
    // -----------------------
    if (method === "PATCH" && path.startsWith("/api/reports/")) {
      if (!requireInternalKeyIfConfigured(req, res)) return;

      const parts = path.split("/").filter(Boolean);

      // PATCH /api/reports/:id/status
      if (parts.length === 4 && parts[3] === "status") {
        const id = parts[2];

        const body = await readJsonBody(req);
        if (body === null) {
          return json(res, 400, { success: false, error: "Invalid JSON body" });
        }

        const { status } = body;
        if (!status) {
          return json(res, 400, { success: false, error: "Missing field: status" });
        }

        const updated = await sql`
          UPDATE reports
          SET status = ${status}
          WHERE id = ${id}::uuid
          RETURNING
            id,
            client_id,
            period,
            summary,
            next_actions,
            snapshot_json,
            status,
            created_at
        `;

        if (!updated || updated.length === 0) {
          return json(res, 404, { success: false, error: "Report not found" });
        }

        return json(res, 200, { success: true, data: updated[0] });
      }

      // PATCH /api/reports/:id
      if (parts.length === 3) {
        const id = parts[2];

        const body = await readJsonBody(req);
        if (body === null) {
          return json(res, 400, { success: false, error: "Invalid JSON body" });
        }

        const allowed = ["period", "summary", "next_actions", "snapshot_json", "status"];
        const sets = [];

        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            if (key === "snapshot_json") {
              sets.push(sql`snapshot_json = ${body.snapshot_json}::jsonb`);
            } else {
              sets.push(sql`${sql.unsafe(key)} = ${body[key]}`);
            }
          }
        }

        if (sets.length === 0) {
          return json(res, 400, { success: false, error: "No valid fields to update" });
        }

        const updated = await sql`
          UPDATE reports
          SET ${sql.join(sets, sql`, `)}
          WHERE id = ${id}::uuid
          RETURNING
            id,
            client_id,
            period,
            summary,
            next_actions,
            snapshot_json,
            status,
            created_at
        `;

        if (!updated || updated.length === 0) {
          return json(res, 404, { success: false, error: "Report not found" });
        }

        return json(res, 200, { success: true, data: updated[0] });
      }
    }

    // -----------------------
    // Not found
    // -----------------------
    return json(res, 404, { success: false, error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(res, 500, { success: false, error: "Internal server error" });
  }
}

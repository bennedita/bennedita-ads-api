import { sql } from "./_lib/db.js";

function getUrl(req) {
  const host = req.headers?.host || "localhost";
  return new URL(req.url, `https://${host}`);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  const url = getUrl(req);
  const path = url.pathname;
  const method = req.method || "GET";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-internal-api-key");
  if (method === "OPTIONS") return res.status(204).end();

  try {
    // GET /api/health
    if (method === "GET" && path === "/api/health") {
      return json(res, 200, { success: true, status: "ok" });
    }

    // GET /api/reports (list - sem filtros por enquanto)
    if (method === "GET" && path === "/api/reports") {
      const limit = Math.min(toInt(url.searchParams.get("limit"), 20), 100);
      const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

      const items = await sql`
        SELECT
          r.id,
          r.client_id,
          c.name as client_name,
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

      const totalRows = await sql`
        SELECT COUNT(*)::int as total
        FROM reports r
      `;

      const total = totalRows?.[0]?.total ?? 0;

      return json(res, 200, {
        success: true,
        data: { items, pagination: { limit, offset, total } },
      });
    }
    // POST /api/reports
if (method === "POST" && path === "/api/reports") {
  const body = await new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => resolve(JSON.parse(data || "{}")));
  });

  const {
    client_id,
    period,
    summary,
    next_actions,
    snapshot_json,
    status
  } = body;

  if (!client_id || !period) {
    return json(res, 400, { success: false, error: "Missing required fields" });
  }

  const rows = await sql`
    INSERT INTO reports (
      client_id,
      period,
      summary,
      next_actions,
      snapshot_json,
      status
    )
    VALUES (
      ${client_id}::uuid,
      ${period},
      ${summary},
      ${next_actions},
      ${JSON.stringify(snapshot_json || {})}::jsonb,
      ${status || "rascunho"}
    )
    RETURNING id
  `;

  return json(res, 201, {
    success: true,
    data: { id: rows[0].id }
  });
}
// PATCH /api/reports/:id
if (method === "PATCH" && path.startsWith("/api/reports/")) {
  const id = path.split("/").pop();

  const body = await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });

  const fields = ["period", "summary", "next_actions", "snapshot_json", "status"];
  const sets = [];

  for (const f of fields) {
    if (body[f] !== undefined) {
      if (f === "snapshot_json") {
        sets.push(sql`snapshot_json = ${JSON.stringify(body[f] || {})}::jsonb`);
      } else {
        sets.push(sql`${sql([f])} = ${body[f]}`);
      }
    }
  }

  if (sets.length === 0) {
    return json(res, 400, { success: false, error: "No valid fields to update" });
  }

  // monta "SET a=..., b=..." sem sql.join (pra evitar $1 quebrado)
  let setSql = sql`${sets[0]}`;
  for (let i = 1; i < sets.length; i++) {
    setSql = sql`${setSql}, ${sets[i]}`;
  }

  const updated = await sql`
    UPDATE reports
    SET ${setSql}
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (!updated || updated.length === 0) {
    return json(res, 404, { success: false, error: "Report not found" });
  }

  return json(res, 200, { success: true, data: { id: updated[0].id } });
}    
// GET /api/reports/:id
if (method === "GET" && path.startsWith("/api/reports/")) {

  const id = path.split("/").pop();

  const rows = await sql`
    SELECT
      r.id,
      r.client_id,
      c.name as client_name,
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

  return json(res, 200, {
    success: true,
    data: rows[0]
  });
}
    return json(res, 404, { success: false, error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(res, 500, {
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}

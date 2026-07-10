```javascript
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

async function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

export default async function handler(req, res) {
  const url = getUrl(req);
  const path = url.pathname;
  const method = req.method || "GET";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-internal-api-key"
  );

  if (method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // =========================================================
    // HEALTH
    // =========================================================

    // GET /api/health
    if (method === "GET" && path === "/api/health") {
      return json(res, 200, {
        success: true,
        status: "ok",
      });
    }

    // =========================================================
    // REPORTS
    // =========================================================

    // GET /api/reports
    if (method === "GET" && path === "/api/reports") {
      const limit = Math.min(
        toInt(url.searchParams.get("limit"), 20),
        100
      );

      const offset = Math.max(
        toInt(url.searchParams.get("offset"), 0),
        0
      );

      const items = await sql`
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

      const totalRows = await sql`
        SELECT COUNT(*)::int AS total
        FROM reports
      `;

      const total = totalRows?.[0]?.total ?? 0;

      return json(res, 200, {
        success: true,
        data: {
          items,
          pagination: {
            limit,
            offset,
            total,
          },
        },
      });
    }

    // POST /api/reports
    if (method === "POST" && path === "/api/reports") {
      const body = await readJsonBody(req);

      const {
        client_id,
        period,
        summary,
        next_actions,
        snapshot_json,
        status,
      } = body;

      if (!client_id || !period) {
        return json(res, 400, {
          success: false,
          error: "Missing required fields",
        });
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
          ${summary || ""},
          ${next_actions || ""},
          ${JSON.stringify(snapshot_json || {})}::jsonb,
          ${status || "rascunho"}
        )
        RETURNING id
      `;

      return json(res, 201, {
        success: true,
        data: {
          id: rows[0].id,
        },
      });
    }

    // GET /api/reports/:id
    if (
      method === "GET" &&
      path.startsWith("/api/reports/") &&
      path !== "/api/reports/"
    ) {
      const id = path.split("/").pop();

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
        return json(res, 404, {
          success: false,
          error: "Report not found",
        });
      }

      return json(res, 200, {
        success: true,
        data: rows[0],
      });
    }

    // PATCH /api/reports/:id
    if (
      method === "PATCH" &&
      path.startsWith("/api/reports/") &&
      path !== "/api/reports/"
    ) {
      const id = path.split("/").pop();
      const body = await readJsonBody(req);

      const currentRows = await sql`
        SELECT
          period,
          summary,
          next_actions,
          snapshot_json,
          status
        FROM reports
        WHERE id = ${id}::uuid
        LIMIT 1
      `;

      if (!currentRows || currentRows.length === 0) {
        return json(res, 404, {
          success: false,
          error: "Report not found",
        });
      }

      const current = currentRows[0];

      const updatedRows = await sql`
        UPDATE reports
        SET
          period = ${body.period ?? current.period},
          summary = ${body.summary ?? current.summary},
          next_actions = ${body.next_actions ?? current.next_actions},
          snapshot_json = ${
            JSON.stringify(
              body.snapshot_json ?? current.snapshot_json ?? {}
            )
          }::jsonb,
          status = ${body.status ?? current.status}
        WHERE id = ${id}::uuid
        RETURNING id
      `;

      return json(res, 200, {
        success: true,
        data: {
          id: updatedRows[0].id,
        },
      });
    }

    // =========================================================
    // GOOGLE ADS
    // =========================================================

    // GET /api/google/report
    if (method === "GET" && path === "/api/google/report") {
      const customerIdRaw =
        url.searchParams.get("customer_id") || "";

      const period =
        url.searchParams.get("period") || "";

      const customerId = String(customerIdRaw).replace(/\D/g, "");

      if (!customerId) {
        return json(res, 400, {
          success: false,
          error: "Missing customer_id",
        });
      }

      const rows = await sql`
        SELECT
          r.id,
          r.period,
          r.snapshot_json,
          r.created_at,
          c.google_customer_id,
          c.name AS client_name
        FROM reports r
        JOIN clients c ON c.id = r.client_id
        WHERE REPLACE(
          REPLACE(
            REPLACE(c.google_customer_id, '-', ''),
            ' ',
            ''
          ),
          '.',
          ''
        ) = ${customerId}
        ORDER BY r.created_at DESC
        LIMIT 1
      `;

      if (!rows || rows.length === 0) {
        return json(res, 404, {
          success: false,
          error: "Report not found for this customer",
        });
      }

      const row = rows[0];
      const snapshot = row.snapshot_json || {};

      const spend = Number(
        snapshot.cost ?? snapshot.spend ?? 0
      );

      const conversions = Number(
        snapshot.leads ?? snapshot.conversions ?? 0
      );

      const clicks = Number(snapshot.clicks ?? 0);
      const impressions = Number(snapshot.impressions ?? 0);

      return json(res, 200, {
        period: row.period || period,
        customer_id:
          row.google_customer_id || customerIdRaw,
        clientName: row.client_name || "",
        generatedAt: row.created_at,

        data: {
          spend,
          clicks,
          conversions,
          impressions,

          ctr:
            impressions > 0
              ? (clicks / impressions) * 100
              : 0,

          cpc:
            clicks > 0
              ? spend / clicks
              : 0,

          cpa:
            conversions > 0
              ? spend / conversions
              : 0,
        },

        campaigns: snapshot.campaigns || [],
        chartData: snapshot.chartData || [],
        insights: snapshot.insights || [],
      });
    }

    // =========================================================
    // META ADS
    // =========================================================

    // GET /api/meta/report
    //
    // Exemplo:
    // /api/meta/report?account_id=act_305595681360170&date_preset=last_30d
    if (method === "GET" && path === "/api/meta/report") {
      const accountIdRaw =
        url.searchParams.get("account_id") || "";

      const datePreset =
        url.searchParams.get("date_preset") || "last_30d";

      if (!accountIdRaw) {
        return json(res, 400, {
          success: false,
          error: "Missing account_id",
        });
      }

      const cleanAccountId = String(accountIdRaw).replace(
        /\D/g,
        ""
      );

      if (!cleanAccountId) {
        return json(res, 400, {
          success: false,
          error: "Invalid account_id",
        });
      }

      const accountId = `act_${cleanAccountId}`;

      const accessToken = process.env.META_ACCESS_TOKEN;
      const apiVersion =
        process.env.META_API_VERSION || "v25.0";

      if (!accessToken) {
        return json(res, 500, {
          success: false,
          error: "META_ACCESS_TOKEN is not configured",
        });
      }

      const fields = [
        "spend",
        "impressions",
        "clicks",
        "inline_link_clicks",
        "ctr",
        "cpm",
        "cpc",
        "actions",
        "date_start",
        "date_stop",
      ].join(",");

      const metaApiUrl =
        `https://graph.facebook.com/${apiVersion}` +
        `/${accountId}/insights` +
        `?fields=${encodeURIComponent(fields)}` +
        `&date_preset=${encodeURIComponent(datePreset)}` +
        `&access_token=${encodeURIComponent(accessToken)}`;

      const response = await fetch(metaApiUrl);
      const result = await response.json();

      if (!response.ok || result.error) {
        return json(res, response.status || 500, {
          success: false,
          error: "Meta Ads request failed",
          details: result.error || result,
        });
      }

      const insight = result.data?.[0] || {};

      const spend = Number(insight.spend || 0);
      const impressions = Number(insight.impressions || 0);
      const clicks = Number(insight.clicks || 0);

      const linkClicks = Number(
        insight.inline_link_clicks || 0
      );

      const actions = Array.isArray(insight.actions)
        ? insight.actions
        : [];

      const leadAction = actions.find((item) =>
        [
          "lead",
          "onsite_conversion.lead_grouped",
          "onsite_conversion.messaging_conversation_started_7d",
          "messaging_conversation_started_7d",
        ].includes(item.action_type)
      );

      const leads = Number(leadAction?.value || 0);

      const ctr = Number(insight.ctr || 0);
      const cpm = Number(insight.cpm || 0);
      const cpc = Number(insight.cpc || 0);

      return json(res, 200, {
        success: true,
        source: "meta_ads",
        account_id: accountId,
        period: datePreset,
        date_start: insight.date_start || null,
        date_stop: insight.date_stop || null,

        data: {
          spend,
          impressions,
          clicks,
          linkClicks,
          leads,
          ctr,
          cpm,
          cpc,
          cpl:
            leads > 0
              ? spend / leads
              : 0,
        },

        campaigns: [],
        chartData: [],
        insights: [],
        raw: result.data || [],
      });
    }

    // =========================================================
    // ROTA NÃO ENCONTRADA
    // =========================================================

    return json(res, 404, {
      success: false,
      error: "Not found",
    });
  } catch (err) {
    console.error("API error:", err);

    return json(res, 500, {
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}
```

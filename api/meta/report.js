import { sql } from "../_lib/db.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getUrl(req) {
  const host = req.headers?.host || "localhost";
  return new URL(req.url, `https://${host}`);
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getActionValue(actions, acceptedTypes) {
  if (!Array.isArray(actions)) {
    return 0;
  }

  for (const actionType of acceptedTypes) {
    const action = actions.find(
      (item) => item?.action_type === actionType
    );

    if (action) {
      return Number(action.value || 0);
    }
  }

  return 0;
}

export default async function handler(req, res) {
  const method = req.method || "GET";
  const url = getUrl(req);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-internal-api-key"
  );

  if (method === "OPTIONS") {
    return res.status(204).end();
  }

  if (method !== "GET") {
    return json(res, 405, {
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // =========================================================
    // 1. RECEBER CLIENT_ID
    // =========================================================

    const clientId =
      url.searchParams.get("client_id") || "";

    const datePreset =
      url.searchParams.get("date_preset") || "last_30d";

    if (!clientId) {
      return json(res, 400, {
        success: false,
        error: "Missing client_id",
      });
    }

    if (!isValidUuid(clientId)) {
      return json(res, 400, {
        success: false,
        error: "Invalid client_id",
      });
    }

    // Evita enviar valores inesperados para a API da Meta.
    const allowedDatePresets = [
      "today",
      "yesterday",
      "this_week_sun_today",
      "this_week_mon_today",
      "last_week_sun_sat",
      "last_week_mon_sun",
      "this_month",
      "last_month",
      "last_7d",
      "last_14d",
      "last_28d",
      "last_30d",
      "last_90d",
      "maximum",
    ];

    if (!allowedDatePresets.includes(datePreset)) {
      return json(res, 400, {
        success: false,
        error: "Invalid date_preset",
        allowed_values: allowedDatePresets,
      });
    }

    // =========================================================
    // 2. BUSCAR CONTA META NO NEON
    // =========================================================

const accountRows = await sql`
  SELECT
    aa.id,
    aa.client_id,
    aa.platform,
    aa.account_id,
    aa.account_name,
    aa.active,
    c.name AS client_name
  FROM ad_accounts aa
  JOIN clients c
    ON c.id = aa.client_id
  WHERE aa.client_id = ${clientId}::uuid
    AND LOWER(aa.platform) = 'meta'
    AND aa.active = true
  ORDER BY aa.account_name ASC NULLS LAST
  LIMIT 1
`;

if (!accountRows || accountRows.length === 0) {
  return json(res, 404, {
    success: false,
    error: "Active Meta Ads account not found for this client",
  });
}

const account = accountRows[0];

if (!metaAccount) {
  return json(res, 404, {
    success: false,
    error: "No Meta account found among this client's ad accounts",
    debug: {
      client_id_received: clientId,
      accounts_found: accountRows,
    },
  });
}

const account = {
  ...metaAccount,
  client_name: "",
};

    const cleanAccountId = String(
      account.account_id || ""
    ).replace(/\D/g, "");

    if (!cleanAccountId) {
      return json(res, 500, {
        success: false,
        error: "Invalid Meta account_id stored in ad_accounts",
      });
    }

    const metaAccountId = `act_${cleanAccountId}`;

    // =========================================================
    // 3. VALIDAR VARIÁVEIS DA VERCEL
    // =========================================================

    const accessToken = process.env.META_ACCESS_TOKEN;

    const apiVersion =
      process.env.META_API_VERSION || "v25.0";

    if (!accessToken) {
      return json(res, 500, {
        success: false,
        error: "META_ACCESS_TOKEN is not configured",
      });
    }

    // =========================================================
    // 4. CONSULTAR META MARKETING API
    // =========================================================

    const fields = [
      "spend",
      "impressions",
      "reach",
      "clicks",
      "inline_link_clicks",
      "ctr",
      "cpm",
      "cpc",
      "actions",
      "date_start",
      "date_stop",
    ].join(",");

    const params = new URLSearchParams({
      fields,
      date_preset: datePreset,
      level: "account",
      access_token: accessToken,
    });

    const metaApiUrl =
      `https://graph.facebook.com/${apiVersion}` +
      `/${metaAccountId}/insights?${params.toString()}`;

    const metaResponse = await fetch(metaApiUrl);

    let metaResult;

    try {
      metaResult = await metaResponse.json();
    } catch {
      return json(res, 502, {
        success: false,
        error: "Invalid response received from Meta Ads API",
      });
    }

    if (!metaResponse.ok || metaResult.error) {
      return json(res, metaResponse.status || 502, {
        success: false,
        error: "Meta Ads request failed",
        details: metaResult.error || metaResult,
      });
    }

    // =========================================================
    // 5. NORMALIZAR MÉTRICAS
    // =========================================================

    const insight = metaResult.data?.[0] || {};

    const spend = Number(insight.spend || 0);
    const impressions = Number(insight.impressions || 0);
    const reach = Number(insight.reach || 0);
    const clicks = Number(insight.clicks || 0);

    const linkClicks = Number(
      insight.inline_link_clicks || 0
    );

    const actions = Array.isArray(insight.actions)
      ? insight.actions
      : [];

    /*
      Usamos prioridade, e não soma, porque alguns tipos de ação
      podem representar a mesma conversão em classificações diferentes.
    */
    const leads = getActionValue(actions, [
      "lead",
      "onsite_conversion.lead_grouped",
      "onsite_conversion.lead",
      "offsite_conversion.fb_pixel_lead",
    ]);

    const messagingConversations = getActionValue(actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
    ]);

    const conversions =
      leads > 0 ? leads : messagingConversations;

    const ctr =
      insight.ctr !== undefined
        ? Number(insight.ctr || 0)
        : impressions > 0
          ? (clicks / impressions) * 100
          : 0;

    const cpm =
      insight.cpm !== undefined
        ? Number(insight.cpm || 0)
        : impressions > 0
          ? (spend / impressions) * 1000
          : 0;

    const cpc =
      insight.cpc !== undefined
        ? Number(insight.cpc || 0)
        : clicks > 0
          ? spend / clicks
          : 0;

    const cpl =
      conversions > 0
        ? spend / conversions
        : 0;

    // =========================================================
    // 6. RETORNAR JSON PADRONIZADO
    // =========================================================

    return json(res, 200, {
      success: true,
      platform: "meta",
      source: "meta_ads",

      client: {
        id: account.client_id,
        name: account.client_name || "",
      },

      account: {
        id: metaAccountId,
        name: account.account_name || "",
      },

      period: {
        preset: datePreset,
        date_start: insight.date_start || null,
        date_stop: insight.date_stop || null,
      },

      data: {
        spend,
        impressions,
        reach,
        clicks,
        linkClicks,
        leads,
        messagingConversations,
        conversions,
        ctr,
        cpm,
        cpc,
        cpl,
      },

      campaigns: [],
      chartData: [],
      insights: [],

      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Meta report API error:", error);

    return json(res, 500, {
      success: false,
      error: "Internal Server Error",
      details: error?.message || String(error),
    });
  }
}

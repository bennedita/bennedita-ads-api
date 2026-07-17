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
    String(value || ""),
  );
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function getActionValue(actions, acceptedTypes) {
  if (!Array.isArray(actions)) {
    return 0;
  }

  for (const actionType of acceptedTypes) {
    const action = actions.find(
      (item) => item?.action_type === actionType,
    );

    if (action) {
      return toNumber(action.value);
    }
  }

  return 0;
}

function getConversions(actions) {
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

  return {
    leads,
    messagingConversations,
    conversions:
      leads > 0
        ? leads
        : messagingConversations,
  };
}

async function requestMetaInsights({
  apiVersion,
  metaAccountId,
  accessToken,
  fields,
  datePreset,
  timeIncrement,
  level = "account",
}) {
  const params = new URLSearchParams({
    fields,
    date_preset: datePreset,
    level,
    limit: "500",
    access_token: accessToken,
  });

  if (timeIncrement) {
    params.set("time_increment", String(timeIncrement));
  }

  const metaApiUrl =
    `https://graph.facebook.com/${apiVersion}` +
    `/${metaAccountId}/insights?${params.toString()}`;

  let response;

  try {
    response = await fetch(metaApiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (fetchError) {
    const isTimeout =
      fetchError?.name === "TimeoutError" ||
      fetchError?.name === "AbortError";

    const error = new Error(
      isTimeout
        ? "Meta Ads API request timed out"
        : "Could not connect to Meta Ads API",
    );

    error.status = 502;
    error.details =
      fetchError?.message || String(fetchError);

    throw error;
  }

  let result;

  try {
    result = await response.json();
  } catch {
    const error = new Error(
      "Invalid response received from Meta Ads API",
    );

    error.status = 502;
    error.details = {
      http_status: response.status,
    };

    throw error;
  }

  if (!response.ok || result?.error) {
    const error = new Error(
      "Meta Ads request failed",
    );

    error.status = response.status || 502;
    error.details = result?.error || result;

    throw error;
  }

  return result;
}

export default async function handler(req, res) {
  const method = req.method || "GET";
  const url = getUrl(req);

  // =========================================================
  // CORS
  // =========================================================

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-internal-api-key",
  );

  if (method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (method !== "GET") {
    return json(res, 405, {
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // =========================================================
    // 1. RECEBER E VALIDAR PARÂMETROS
    // =========================================================

    const clientId = String(
      url.searchParams.get("client_id") || "",
    ).trim();

    const datePreset = String(
      url.searchParams.get("date_preset") ||
        "last_30d",
    ).trim();

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
      LEFT JOIN clients c
        ON c.id = aa.client_id
      WHERE aa.client_id = ${clientId}::uuid
        AND LOWER(TRIM(aa.platform)) = 'meta'
        AND aa.active = true
      ORDER BY aa.account_name ASC NULLS LAST
      LIMIT 1
    `;

    if (!accountRows || accountRows.length === 0) {
      return json(res, 404, {
        success: false,
        error:
          "Active Meta Ads account not found for this client",
        client_id: clientId,
      });
    }

    const account = accountRows[0];

    const cleanAccountId = String(
      account.account_id || "",
    ).replace(/\D/g, "");

    if (!cleanAccountId) {
      return json(res, 500, {
        success: false,
        error:
          "Invalid Meta account_id stored in ad_accounts",
      });
    }

    const metaAccountId =
      `act_${cleanAccountId}`;

    // =========================================================
    // 3. VALIDAR VARIÁVEIS DA VERCEL
    // =========================================================

    const accessToken = String(
      process.env.META_ACCESS_TOKEN || "",
    ).trim();

    const apiVersion = String(
      process.env.META_API_VERSION || "v25.0",
    ).trim();

    if (!accessToken) {
      return json(res, 500, {
        success: false,
        error:
          "META_ACCESS_TOKEN is not configured",
      });
    }

    // =========================================================
    // 4. CONSULTAR RESUMO E EVOLUÇÃO DIÁRIA
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

    const [summaryResult, dailyResult, campaignResult] =
  await Promise.all([
    requestMetaInsights({
      apiVersion,
      metaAccountId,
      accessToken,
      fields,
      datePreset,
    }),

    requestMetaInsights({
      apiVersion,
      metaAccountId,
      accessToken,
      fields,
      datePreset,
      timeIncrement: 1,
    }),

    requestMetaInsights({
      apiVersion,
      metaAccountId,
      accessToken,
      fields: [
        "campaign_id",
        "campaign_name",
        "spend",
        "impressions",
        "clicks",
        "inline_link_clicks",
        "ctr",
        "cpm",
        "cpc",
        "actions",
      ].join(","),
      datePreset,
      level: "campaign",
    }),
  ]);

    // =========================================================
    // 5. NORMALIZAR RESUMO
    // =========================================================

    const insight =
      summaryResult?.data?.[0] || {};

    const spend = toNumber(insight.spend);
    const impressions = toNumber(
      insight.impressions,
    );
    const reach = toNumber(insight.reach);
    const clicks = toNumber(insight.clicks);

    const linkClicks = toNumber(
      insight.inline_link_clicks,
    );

    const actions = Array.isArray(
      insight.actions,
    )
      ? insight.actions
      : [];

    const {
      leads,
      messagingConversations,
      conversions,
    } = getConversions(actions);

    const ctr =
      insight.ctr !== undefined
        ? toNumber(insight.ctr)
        : impressions > 0
          ? (clicks / impressions) * 100
          : 0;

    const cpm =
      insight.cpm !== undefined
        ? toNumber(insight.cpm)
        : impressions > 0
          ? (spend / impressions) * 1000
          : 0;

    const cpc =
      insight.cpc !== undefined
        ? toNumber(insight.cpc)
        : clicks > 0
          ? spend / clicks
          : 0;

    const cpl =
      conversions > 0
        ? spend / conversions
        : 0;

    // =========================================================
    // 6. NORMALIZAR EVOLUÇÃO DIÁRIA
    // =========================================================

    const dailyRows = Array.isArray(
      dailyResult?.data,
    )
      ? dailyResult.data
      : [];

    const chartData = dailyRows.map(
      (dailyInsight) => {
        const dailySpend = toNumber(
          dailyInsight.spend,
        );

        const dailyActions = Array.isArray(
          dailyInsight.actions,
        )
          ? dailyInsight.actions
          : [];

        const dailyConversions =
          getConversions(
            dailyActions,
          ).conversions;

        return {
          name:
            dailyInsight.date_start || "",

          date:
            dailyInsight.date_start || "",

          investimento: dailySpend,
          spend: dailySpend,

          leads: dailyConversions,
          conversions: dailyConversions,
        };
      },
    );
// =========================================================
// NORMALIZAR CAMPANHAS
// =========================================================

const campaignRows = Array.isArray(campaignResult?.data)
  ? campaignResult.data
  : [];

const campaigns = campaignRows.map((campaign) => {
  const spend = toNumber(campaign.spend);
  const clicks = toNumber(campaign.clicks);

  const {
    conversions,
  } = getConversions(
    Array.isArray(campaign.actions)
      ? campaign.actions
      : [],
  );

  return {
    id: campaign.campaign_id,
    name: campaign.campaign_name || "Sem nome",
    investimento: spend,
    cliques: clicks,
    leads: conversions,
    cpl: conversions > 0 ? spend / conversions : 0,
  };
});
    // =========================================================
    // 7. RETORNAR JSON PADRONIZADO
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
        date_start:
          insight.date_start ||
          chartData[0]?.date ||
          null,

        date_stop:
          insight.date_stop ||
          chartData[
            chartData.length - 1
          ]?.date ||
          null,
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

      campaigns,
      chartData,
      insights: [],

      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Meta report API error:",
      error,
    );

    return json(
      res,
      error?.status || 500,
      {
        success: false,
        error:
          error?.message ||
          "Internal Server Error",

        details:
          error?.details ||
          error?.message ||
          String(error),
      },
    );
  }
}

export function requireInternalAuth(req, res) {
  console.log("HEADERS:", req.headers);
  
  const expected = (process.env.INTERNAL_API_KEY || "").trim();

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_API_KEY not set",
      code: "CONFIG_ERROR",
    });
  }

  // ✅ Permite execução automática da Vercel Cron
const isVercelCronHeader = req.headers["x-vercel-cron"] === "1";
const userAgent = String(req.headers["user-agent"] || "");
const isVercelCronUA = userAgent.includes("vercel-cron");

if (isVercelCronHeader || isVercelCronUA) {
  return null;
}

  // ✅ Permite chamadas internas autenticadas via header
  const provided = String(
  req.headers["x-internal-api-key"] ||
  req.query["x-internal-api-key"] ||
  ""
).trim();

  if (!provided || provided !== expected) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  }

  return null; // autorizado
}

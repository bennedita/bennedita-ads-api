export function requireInternalAuth(req, res) {
  const expected = (process.env.INTERNAL_API_KEY || "").trim();

  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_API_KEY not set",
      code: "CONFIG_ERROR",
    });
  }

  // ✅ Permite execução automática da Vercel Cron
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  if (isVercelCron) {
    return null;
  }

  // ✅ Permite chamadas internas autenticadas via header
  const provided = String(req.headers["x-internal-api-key"] || "").trim();

  if (!provided || provided !== expected) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  }

  return null; // autorizado
}

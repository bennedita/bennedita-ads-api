export default async function handler(req, res) {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).json({ ok: false, error });
    }

    if (!code) {
      return res.status(400).json({ ok: false, message: "Code não recebido" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const redirectUri =
      "https://bennedita-ads-api.vercel.app/api/auth/google/callback";

    const body = new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await r.json();

    // TEMPORÁRIO: devolver refresh_token na tela para você copiar o VALUE.
    return res.status(200).json({
      ok: true,
      refresh_token: data.refresh_token || null,
      access_token: data.access_token || null,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type,
      raw_error: r.ok ? null : data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

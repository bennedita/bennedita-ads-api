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

    // IMPORTANTE: não vamos devolver tokens reais na tela (segurança).
    return res.status(200).json({
      ok: true,
      has_refresh_token: Boolean(data.refresh_token),
      received: {
        access_token: Boolean(data.access_token),
        refresh_token: Boolean(data.refresh_token),
        expires_in: data.expires_in,
        scope: data.scope,
        token_type: data.token_type,
      },
      // se não vier refresh_token, mostramos o erro para diagnosticar
      debug: data.refresh_token ? undefined : data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

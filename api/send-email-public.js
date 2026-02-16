import { Resend } from "resend";

const allowedOrigins = new Set([
  "https://lead-report-peek.lovable.app",
]);

function setCors(req, res) {
  const origin = req.headers.origin || "";

  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  setCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Método
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Bloqueia chamadas fora do seu app (evita abuso sem login)
  const origin = req.headers.origin || "";
  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ ok: false, error: "Forbidden origin" });
  }

  // Trava básica: limite de tamanho
  const rawLen = Number(req.headers["content-length"] || 0);
  if (rawLen > 50_000) {
    return res.status(413).json({ ok: false, error: "Payload too large" });
  }

  // ENV: Resend key
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) {
    return res.status(500).json({
      ok: false,
      error: "Server misconfigured: RESEND_API_KEY missing",
    });
  }

  // ENV: remetente (profissional assim que DNS verificar)
  // Configure na Vercel: EMAIL_FROM="Relatórios Bennedita <relatorios@bennedita.com.br>"
  // Enquanto isso, fallback para onboarding:
  const emailFrom =
    String(process.env.EMAIL_FROM || "").trim() ||
    "Bennedita Ads <onboarding@resend.dev>";

  const resend = new Resend(resendKey);

  try {
    const { to, subject, html } = req.body || {};

    // Validações
    const subjectOk = typeof subject === "string" && subject.trim().length > 0;
    const htmlOk = typeof html === "string" && html.trim().length > 0;

    // `to` pode ser string ou array de strings
    const toList = Array.isArray(to) ? to : [to];
    const toOk =
      toList.length > 0 &&
      toList.every((e) => typeof e === "string" && isValidEmail(e));

    if (!toOk || !subjectOk || !htmlOk) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload: expected { to, subject, html }",
      });
    }

    const data = await resend.emails.send({
      from: emailFrom,
      to: toList,
      subject: subject.trim(),
      html,
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    // Não retorna stack pro client
    const message =
      (err && typeof err === "object" && "message" in err && err.message) ||
      "Unknown error";

    return res.status(500).json({ ok: false, error: String(message) });
  }
}

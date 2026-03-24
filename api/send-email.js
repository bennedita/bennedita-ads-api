import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, html } = req.body;

    const response = await resend.emails.send({
      from: "Bennedita <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    return res.status(200).json({ success: true, response });
  } catch (error) {
    console.error("Erro ao enviar email:", error);
    return res.status(400).json({ error: error.message });
  }
}

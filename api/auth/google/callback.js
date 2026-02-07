export default function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ ok: false, error });
  }

  if (!code) {
    return res.status(400).json({ ok: false, message: "Code não recebido" });
  }

  return res.status(200).json({ ok: true, code });
}

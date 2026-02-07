export default function handler(req, res) {
  return res.status(200).json({
    status: "ok",
    app: "bennedita-ads-api",
    message: "API funcionando",
    timestamp: new Date().toISOString()
  });
}

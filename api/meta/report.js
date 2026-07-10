export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    success: true,
    source: "meta_ads",
    message: "Meta endpoint funcionando!",
    appId: process.env.META_APP_ID,
    apiVersion: process.env.META_API_VERSION,
    hasToken: !!process.env.META_ACCESS_TOKEN,
  });
}

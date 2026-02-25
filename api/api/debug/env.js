export default function handler(req, res) {
  const key = process.env.INTERNAL_API_KEY || "";

  res.status(200).json({
    hasInternalApiKey: Boolean(key),
    internalApiKeyLength: key.length,
    first3: key.slice(0, 3),
    last3: key.slice(-3),
    nodeEnv: process.env.NODE_ENV,
  });
}

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  const redirectUri = 'https://bennedita-ads-api.vercel.app/auth/google/callback';

  const scope = 'https://www.googleapis.com/auth/adwords';

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.writeHead(302, { Location: authUrl });
  res.end();
}

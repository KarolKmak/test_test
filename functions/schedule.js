export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json();
  const { token, title, body } = data;

  try {
    const accessToken = await getAccessToken(
      env.FCM_CLIENT_EMAIL,
      env.FCM_PRIVATE_KEY
    );

    const fcmResponse = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: token,
            notification: {
              title: title,
              body: body,
            },
            webpush: {
              fcm_options: {
                link: '/',
              },
            },
          },
        }),
      }
    );

    const result = await fcmResponse.json();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  };

  const encodedHeader = b64(JSON.stringify(header));
  const encodedPayload = b64(JSON.stringify(payload));
  const unsignedJwt = `${encodedHeader}.${encodedPayload}`;

  const buffer = str2ab(unsignedJwt);
  const rawKey = pemToBinary(privateKey);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    rawKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    buffer
  );

  const signedJwt = `${unsignedJwt}.${b64ab(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  const tokenRes = await res.json();
  return tokenRes.access_token;
}

function b64(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ab(ab) {
  return b64(String.fromCharCode(...new Uint8Array(ab)));
}

function str2ab(str) {
  return new TextEncoder().encode(str);
}

function pemToBinary(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '') // Handles literal \n strings
    .replace(/\s/g, ''); // Handles actual newlines and spaces
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

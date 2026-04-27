export default {
  async scheduled(event, env, ctx) {
    const now = Date.now();

    // 1. List all notifications in KV
    const list = await env.NOTIFICATIONS_KV.list({ prefix: "notif:" });

    for (const item of list.keys) {
      // Key format: notif:timestamp:id
      const parts = item.name.split(':');
      const timestamp = parseInt(parts[1]);

      // 2. Check if it's time to send
      if (timestamp <= now) {
        const dataStr = await env.NOTIFICATIONS_KV.get(item.name);
        if (dataStr) {
          const data = JSON.parse(dataStr);

          try {
            // 3. Send via FCM (Using same logic as before)
            await sendFcm(env, data);

            // 4. Delete from KV after successful send
            await env.NOTIFICATIONS_KV.delete(item.name);
          } catch (e) {
            console.error("Failed to send scheduled notif:", e);
          }
        }
      }
    }
  }
};

async function sendFcm(env, data) {
  const accessToken = await getAccessToken(env.FCM_CLIENT_EMAIL, env.FCM_PRIVATE_KEY, env.FCM_PROJECT_ID);

  await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: data.token,
        notification: { title: data.title, body: data.body },
        webpush: { fcm_options: { link: '/' } }
      }
    }),
  });
}

// Reuse the getAccessToken and helper functions from schedule.js here...
async function getAccessToken(email, privateKey, projectId) {
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
  const buffer = new TextEncoder().encode(unsignedJwt);

  const base64 = privateKey.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\\n/g, '').replace(/\s/g, '');
  const rawKey = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey('pkcs8', rawKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, buffer);
  const signedJwt = `${unsignedJwt}.${b64(String.fromCharCode(...new Uint8Array(signature)))}`;

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

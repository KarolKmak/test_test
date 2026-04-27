export default {
  // 1. This runs on the Cron schedule (every minute)
  async scheduled(event, env, ctx) {
    await processNotifications(env);
  },

  // 2. This allows you to test it MANUALLY by visiting the Worker URL
  async fetch(request, env, ctx) {
    const results = await processNotifications(env);
    return new Response(JSON.stringify({
      message: "Manual check complete",
      time_utc: new Date().toISOString(),
      results
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

async function processNotifications(env) {
  const now = Date.now();
  const list = await env.NOTIFICATIONS_KV.list({ prefix: "notif:" });
  const log = [];

  for (const item of list.keys) {
    const parts = item.name.split(':');
    if (parts.length < 2) continue;

    const timestamp = parseInt(parts[1]);

    if (timestamp <= now) {
      const dataStr = await env.NOTIFICATIONS_KV.get(item.name);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        try {
          const result = await sendFcm(env, data);
          await env.NOTIFICATIONS_KV.delete(item.name);
          log.push(`SENT: ${data.title} to ${data.token.substring(0, 10)}... Result: ${JSON.stringify(result)}`);
        } catch (e) {
          log.push(`FAILED ${item.name}: ${e.message}`);
        }
      }
    } else {
      log.push(`SKIPPED: Not due yet. Due in ${Math.round((timestamp - now) / 60000)} mins`);
    }
  }
  return log;
}

async function sendFcm(env, data) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: data.token,
        notification: { title: data.title, body: data.body },
        webpush: { fcm_options: { link: '/' } },
      },
    }),
  });
  return await response.json();
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  };

  const encodedHeader = b64(JSON.stringify(header));
  const encodedPayload = b64(JSON.stringify(payload));
  const unsignedJwt = `${encodedHeader}.${encodedPayload}`;
  const buffer = new TextEncoder().encode(unsignedJwt);

  const base64Key = env.FCM_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\\n/g, '').replace(/\s/g, '');
  const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey('pkcs8', rawKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, buffer);
  const signedJwt = `${unsignedJwt}.${b64ab(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  const tokenRes = await res.json();
  if (tokenRes.error) throw new Error(tokenRes.error_description || tokenRes.error);
  return tokenRes.access_token;
}

function b64(str) { return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64ab(ab) { return b64(String.fromCharCode(...new Uint8Array(ab))); }

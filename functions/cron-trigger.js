export default {
  async scheduled(event, env, ctx) {
    console.log("Cron trigger started at:", new Date().toISOString());
    const now = Date.now();

    // 1. List all notifications in KV
    const list = await env.NOTIFICATIONS_KV.list({ prefix: "notif:" });
    console.log(`Found ${list.keys.length} total keys in KV`);

    for (const item of list.keys) {
      // Key format: notif:timestamp:id
      const parts = item.name.split(':');
      if (parts.length < 2) continue;

      const timestamp = parseInt(parts[1]);

      // 2. Check if it's time to send
      if (timestamp <= now) {
        console.log(`Processing due notification: ${item.name}`);
        const dataStr = await env.NOTIFICATIONS_KV.get(item.name);

        if (dataStr) {
          const data = JSON.parse(dataStr);

          try {
            // 3. Send via FCM
            const result = await sendFcm(env, data);
            console.log(`FCM Send result for ${item.name}:`, JSON.stringify(result));

            // 4. Delete from KV after successful send
            await env.NOTIFICATIONS_KV.delete(item.name);
            console.log(`Deleted ${item.name} from KV`);
          } catch (e) {
            console.error(`Failed to send ${item.name}:`, e.message);
          }
        }
      } else {
        console.log(`Notification ${item.name} is scheduled for later: ${new Date(timestamp).toISOString()}`);
      }
    }
  }
};

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
        notification: {
          title: data.title,
          body: data.body,
        },
        webpush: {
          fcm_options: {
            link: '/',
          },
        },
      },
    }),
  });

  return await response.json();
}

async function getAccessToken(env) {
  const email = env.FCM_CLIENT_EMAIL;
  const privateKey = env.FCM_PRIVATE_KEY;

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

  // Robust PEM to Binary conversion
  const base64Key = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const rawKey = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));

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
  if (tokenRes.error) throw new Error(tokenRes.error_description || tokenRes.error);
  return tokenRes.access_token;
}

function b64(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ab(ab) {
  return b64(String.fromCharCode(...new Uint8Array(ab)));
}

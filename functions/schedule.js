export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json();

  const { token, scheduledTime, title, body } = data;

  // Since Cloudflare Pages Functions don't have built-in "wait until" for long durations
  // (like days), for a simple test we check if the time is "nowish".
  // In a real production app, you'd store this in KV/D1 and use a Cron Trigger
  // to poll and send. For this test, we'll send it immediately via FCM.

  try {
    const fcmResponse = await sendFcm(env, {
      token,
      title,
      body
    });

    return new Response(JSON.stringify({ success: true, detail: fcmResponse }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function sendFcm(env, payload) {
  const { token, title, body } = payload;

  // NOTE: This uses the Legacy FCM API for simplicity in a "simple app"
  // because HTTP v1 requires complex OAuth2 JWT signing which is hard in a single JS file.
  // Ensure you have "Cloud Messaging API (Legacy)" enabled in Firebase Console.

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${env.FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      to: token,
      notification: {
        title: title,
        body: body,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
      priority: 'high',
    }),
  });

  return await response.json();
}

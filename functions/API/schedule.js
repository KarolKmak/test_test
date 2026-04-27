export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.NOTIFICATIONS_KV) {
    return new Response(JSON.stringify({ error: "KV not bound" }), { status: 500 });
  }

  const data = await request.json();
  const { token, scheduledTime, title, body } = data;

  // Use the timestamp as part of the key so we can easily list/sort them
  const timestamp = new Date(scheduledTime).getTime();
  const id = crypto.randomUUID();
  const key = `notif:${timestamp}:${id}`;

  await env.NOTIFICATIONS_KV.put(key, JSON.stringify({
    token,
    title,
    body,
    scheduledTime
  }));

  return new Response(JSON.stringify({ success: true, id: key }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

const crypto = require('crypto');
const express = require('express');
const client = require('prom-client');
const { createClient } = require('redis');

const SERVICE = 'demo-orders';
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PAYMENTS_URL = process.env.PAYMENTS_URL || 'http://localhost:3002';
const PAYMENT_TIMEOUT_MS = 2000;

// --- Redis ---
// Offline queue is disabled so commands fail immediately when Redis is down
// instead of hanging until it comes back. The client keeps reconnecting on its own.
const redis = createClient({ url: REDIS_URL, disableOfflineQueue: true });
redis.on('error', (err) => console.log(`Redis error: ${err.message}`));
redis.on('ready', () => console.log(`Redis connected: ${REDIS_URL}`));
redis.connect().catch((err) => console.log(`Redis connect failed: ${err.message}`));

const orderKey = (id) => `order:${id}`;
const saveOrder = (order) => redis.set(orderKey(order.id), JSON.stringify(order));

// --- Metrics ---
client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['service', 'route', 'status'],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['service', 'route'],
});

// --- App ---
const app = express();
app.use(express.json());

// Record count and duration for every request once the response is sent.
app.use((req, res, next) => {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // Use the matched route pattern so unknown URLs don't create new label values.
    const route = req.route ? req.route.path : 'unknown';
    httpRequestsTotal.inc({ service: SERVICE, route, status: res.statusCode });
    stopTimer({ service: SERVICE, route });
  });
  next();
});

// Resolves on a 2xx from payments; throws on network error, timeout or non-2xx.
async function requestPayment(orderId, amount) {
  let response;
  try {
    response = await fetch(`${PAYMENTS_URL}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amount }),
      signal: AbortSignal.timeout(PAYMENT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(`payments timed out after ${PAYMENT_TIMEOUT_MS}ms`);
    }
    throw new Error(`payments unreachable (${err.cause?.code || err.message})`);
  }
  if (!response.ok) {
    throw new Error(`payments returned HTTP ${response.status}`);
  }
}

app.post('/orders', async (req, res) => {
  const { item, amount } = req.body || {};
  if (item == null || amount == null) {
    return res.status(400).json({ error: 'item and amount are required' });
  }

  const order = {
    id: crypto.randomUUID(),
    item,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await saveOrder(order);
  console.log(`Order created: id=${order.id} item=${item} amount=${amount}`);

  try {
    await requestPayment(order.id, amount);
  } catch (err) {
    console.log(`Payment failed: orderId=${order.id} reason=${err.message}`);
    order.status = 'payment_failed';
    await saveOrder(order);
    return res.status(502).json({ error: 'payment failed', reason: err.message, order });
  }

  order.status = 'paid';
  await saveOrder(order);
  console.log(`Order paid: id=${order.id}`);
  res.status(201).json(order);
});

app.get('/orders/:id', async (req, res) => {
  const raw = await redis.get(orderKey(req.params.id));
  if (raw == null) {
    return res.status(404).json({ error: 'order not found' });
  }
  res.json(JSON.parse(raw));
});

app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ok', redis: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', redis: 'down' });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Express 5 forwards rejected async handlers here (e.g. Redis down mid-request).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.log(`Request failed: ${req.method} ${req.path} error=${err.message}`);
  res.status(503).json({ error: 'order storage unavailable' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on port ${PORT}`);
});

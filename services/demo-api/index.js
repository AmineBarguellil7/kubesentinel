const express = require('express');
const client = require('prom-client');

const SERVICE = 'demo-api';
const PORT = process.env.PORT || 3000;
const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:3001';
const ORDERS_TIMEOUT_MS = 3000;

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

// Calls orders and resolves with { status, body } for any HTTP response.
// Throws only when orders can't be reached or doesn't answer in time.
async function callOrders(path, options = {}) {
  let response;
  try {
    response = await fetch(`${ORDERS_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(ORDERS_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(`orders timed out after ${ORDERS_TIMEOUT_MS}ms`);
    }
    throw new Error(`orders unreachable (${err.cause?.code || err.message})`);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: 'orders returned a non-JSON response', raw: text };
  }
  return { status: response.status, body };
}

const ordersUnavailable = (res, reason) =>
  res.status(502).json({ error: 'orders service unavailable', reason });

app.post('/checkout', async (req, res) => {
  const { item, amount } = req.body || {};
  if (item == null || amount == null) {
    return res.status(400).json({ error: 'item and amount are required' });
  }

  let result;
  try {
    result = await callOrders('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, amount }),
    });
  } catch (err) {
    console.log(`Checkout failed: item=${item} amount=${amount} reason=${err.message}`);
    return ordersUnavailable(res, err.message);
  }

  const orderId = result.body.id || result.body.order?.id || 'none';
  console.log(`Checkout: item=${item} amount=${amount} status=${result.status} orderId=${orderId}`);
  res.status(result.status).json(result.body);
});

app.get('/checkout/:id', async (req, res) => {
  let result;
  try {
    result = await callOrders(`/orders/${encodeURIComponent(req.params.id)}`);
  } catch (err) {
    console.log(`Checkout lookup failed: id=${req.params.id} reason=${err.message}`);
    return ordersUnavailable(res, err.message);
  }
  res.status(result.status).json(result.body);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.log(`Request failed: ${req.method} ${req.path} error=${err.message}`);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on port ${PORT}`);
});

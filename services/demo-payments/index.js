const express = require('express');
const client = require('prom-client');

const SERVICE = 'demo-payments';
const PORT = process.env.PORT || 3002;
const BANK_DELAY_MS = 100;

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

app.post('/pay', async (req, res) => {
  const { orderId, amount } = req.body || {};
  if (orderId == null || amount == null) {
    return res.status(400).json({ error: 'orderId and amount are required' });
  }

  await new Promise((resolve) => setTimeout(resolve, BANK_DELAY_MS)); // fake bank delay
  console.log(`Payment processed: orderId=${orderId} amount=${amount}`);
  res.json({ orderId, status: 'paid' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`${SERVICE} listening on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

app.use(express.json({ limit: '8mb' }));

async function init() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not configured; API persistence will be unavailable.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS published_proposals (
      token TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      expiry DATE,
      pin TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get('/api/health', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) await pool.query('SELECT 1');
    res.json({ ok: true, database: !!process.env.DATABASE_URL });
  } catch (err) {
    console.error('Healthcheck error', err);
    res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

app.put('/api/proposals/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { payload, enabled = true, expiry = null, pin = '' } = req.body || {};
    if (!token || !payload) return res.status(400).json({ error: 'invalid_payload' });
    await pool.query(`
      INSERT INTO published_proposals(token,payload,enabled,expiry,pin,updated_at)
      VALUES($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(token) DO UPDATE SET
        payload=EXCLUDED.payload,
        enabled=EXCLUDED.enabled,
        expiry=EXCLUDED.expiry,
        pin=EXCLUDED.pin,
        updated_at=NOW()
    `, [token, payload, !!enabled, expiry || null, pin || '']);
    res.json({ ok: true, token });
  } catch (err) {
    console.error('Publish error', err);
    res.status(500).json({ error: 'publish_failed' });
  }
});

app.get('/api/proposals/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const r = await pool.query('SELECT token,payload,enabled,expiry,pin,updated_at FROM published_proposals WHERE token=$1', [token]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const row = r.rows[0];
    if (!row.enabled) return res.status(410).json({ error: 'disabled' });
    if (row.expiry) {
      const expiry = new Date(row.expiry);
      expiry.setHours(23,59,59,999);
      if (expiry < new Date()) return res.status(410).json({ error: 'expired' });
    }
    res.json({
      token: row.token,
      proposal: row.payload,
      enabled: row.enabled,
      expiry: row.expiry,
      pinRequired: !!row.pin,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Load error', err);
    res.status(500).json({ error: 'load_failed' });
  }
});

app.post('/api/proposals/:token/events', async (req, res) => {
  try {
    const { token } = req.params;
    const r = await pool.query('SELECT payload FROM published_proposals WHERE token=$1', [token]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const payload = r.rows[0].payload || {};
    payload.events = payload.events || [];
    payload.events.unshift({
      type: req.body?.type || 'event',
      text: req.body?.text || 'Customer interaction',
      at: new Date().toISOString()
    });
    if (req.body?.response) payload.customerResponse = req.body.response;
    await pool.query('UPDATE published_proposals SET payload=$2,updated_at=NOW() WHERE token=$1', [token, payload]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Event error', err);
    res.status(500).json({ error: 'event_failed' });
  }
});

app.use(express.static(__dirname, { index: false }));
app.get('*', (req, res) => {
  try {
    const file = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const html = file.replace('</body>', '<script src="/app4.js"></script>\n</body>');
    res.type('html').send(html);
  } catch (err) {
    console.error('HTML serve error', err);
    res.status(500).send('Proposal Studio failed to load.');
  }
});

init()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Proposal Studio listening on ${port}`)))
  .catch(err => {
    console.error('Startup database error', err);
    process.exit(1);
  });

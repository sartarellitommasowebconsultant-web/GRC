// Vercel Serverless Function: POST /api/search  { query: string }
const { findPlace } = require('../lib/places');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  try {
    const result = await findPlace(body && body.query);
    return res.status(200).json(result);
  } catch (err) {
    if (err.status) {
      if (err.internal) console.error('[api/search]', err.internal);
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[api/search] Errore imprevisto:', err);
    return res.status(500).json({ error: 'Errore del server. Riprova più tardi.' });
  }
};

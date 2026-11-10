// Server per lo sviluppo locale (npm start). Su Vercel non viene usato:
// lì il frontend è servito da /public e l'API da /api/search.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const searchHandler = require('./api/search');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));
app.all('/api/search', searchHandler);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => {
  console.log(`✅ GRC Link Generator avviato su http://localhost:${port}`);
});

# GRC - Review Link Generator

Genera il link diretto "Scrivi una recensione" di Google per un'attività, partendo dal nome o da un link di Google Maps (anche link brevi `maps.app.goo.gl`).

## Struttura

```
api/search.js     → funzione serverless Vercel (POST /api/search)
lib/places.js     → logica: lettura link Maps + Google Places API
public/           → frontend statico (PWA)
server.js         → server Express solo per sviluppo locale
vercel.json       → configurazione Vercel
```

## Deploy su Vercel

1. Importa il repo su [vercel.com](https://vercel.com) (Framework Preset: **Other**, nessun build command) oppure da terminale: `npx vercel` e poi `npx vercel --prod`.
2. In **Settings → Environment Variables** aggiungi `GOOGLE_MAPS_API_KEY` (Production e Preview), poi rifai il deploy.
3. Node.js 22 è impostato in `package.json` (`engines`).

### Chiave Google
- Abilita **Places API (New)** nel progetto Google Cloud (se è abilitata solo la Places API legacy, l'app la usa in automatico).
- Limita la chiave alle sole Places API e imposta una quota giornaliera: l'endpoint è pubblico e chiunque potrebbe consumarla.

## Sviluppo locale

```bash
npm install
cp .env.example .env   # inserisci la chiave
npm start              # http://localhost:3000
```

## Note
- A ogni rilascio che cambia i file del frontend aggiorna `CACHE_NAME` in `public/sw.js`.

# Sounds Like You

**Audio-based, explainable music discovery — built for HACKATUNE 2026 (Munich Music Labs × Cyanite).**

> Select tracks you like → get acoustically similar recommendations → hear why they match → steer with natural language.

---

## What it does

Sounds Like You is a music recommendation app that works on *how tracks actually sound*, not metadata tags or listening history. You pick tracks you like, the app finds acoustically similar ones using Cyanite's audio AI, and an LLM explains each pick in one sentence.

**Key flows:**

1. **Taste seeding** — pick a user and select up to 10 of their liked tracks as seeds
2. **Similar track discovery** — Cyanite's multi-track similarity API finds tracks that sound like the mean of your seeds
3. **Audio preview** — play any track directly in the browser via Jamendo's public CDN (no sign-in)
4. **AI explanations** — GPT writes one sentence per recommendation explaining the mood/genre/energy match
5. **Natural language refinement** — type "but I want something more upbeat" and the search re-runs with that added to the query
6. **Recommendation map** — an SVG visualization showing your seeds (center dot) and each recommendation (outer dots), colored by dominant mood, with arrows labeled by the biggest mood difference
7. **Inferred AI models panel** — click any track to inspect all 23 Cyanite audio analysis outputs (genre, mood, BPM, instruments, valence/arousal, …)

---

## Architecture

```
Browser (Vue 3 + Vite)
  │
  ├── /api/*  →  Python Bottle server (src/api/app.py)
  │                 ├── POST /api/similar-tracks   → Cyanite similarity search
  │                 ├── POST /api/prompt-search    → Cyanite text prompt search
  │                 ├── POST /api/track-summary    → OpenAI GPT explanations
  │                 └── POST /api/refine-filter    → OpenAI → Cyanite metadata filter
  │
  ├── /cyanite/*  →  Cyanite REST API (model outputs, proxied by Vite)
  │
  └── Jamendo CDN  →  https://prod-1.storage.jamendo.com/download/track/{id}/mp32/
                       (audio, no API key required)
```

**Frontend**: Vue 3, TypeScript, Vite, Tailwind CSS, shadcn/reka-ui components

**Backend**: Python 3, Bottle (lightweight WSGI), no framework dependencies beyond that

**AI / APIs**: Cyanite audio AI (similarity search + tagging), OpenAI GPT-5.5 (track explanations, filter generation)

**Data**: ~357k Jamendo tracks indexed in Cyanite; local pack of 10,561 tracks with display info and 462 user taste profiles

---

## Setup

### 1. Prerequisites

- Python 3.10+
- Node.js 18+
- A Cyanite API key (issued by the HACKATUNE organizers)
- An OpenAI API key (for AI-generated explanations)

### 2. Environment

```bash
cp .env.sample .env
# Edit .env:
# CYANITE_API_KEY=<your key>
# OPENAI_API_KEY=<your key>
```

### 3. Run

```bash
make run
```

This creates a Python venv, installs dependencies, and starts both the API server (port 8001) and the Vite dev server (port 5173) in parallel.

Open [http://localhost:5173](http://localhost:5173).

### 4. Development mode (with hot reload + debug logging)

```bash
make debug
```

---

## Usage walkthrough

### Pick a user and select seeds

The left panel lists 462 pseudonymized users. Click one to load their liked tracks in the middle panel. Click tracks to select them as seeds (up to 10). Selected tracks show a checkmark and turn highlighted.

### Find similar tracks

Click **Find similar** in the right panel. The Cyanite API returns up to 10 tracks ranked by audio similarity to the mean of your seeds. A similarity score (0–1) appears on each result.

### Preview audio

Every track — liked or similar — has a play button. Click it to stream the MP3 from Jamendo. Click again to pause. Only one track plays at a time.

### Read AI explanations

After similar tracks load, GPT writes a one-sentence explanation per result explaining why it matches your seeds (mood, genre, energy, or style). These appear inline under each track title.

### Refine with natural language

Type in the **Refine** box (e.g. "but I want something darker" or "more acoustic") and press Enter or click Refine. The app appends your input to previous queries and re-runs the search with the combined prompt via Cyanite's text-prompt endpoint.

### Recommendation Map

When similar tracks are loaded, the map appears to the right. Your liked tracks form the center dot (colored by their dominant mood). Each recommended track orbits at the same radius, colored by its dominant mood. Arrows are labeled with the biggest mood difference between the seed cluster and that track (e.g. "more calm", "less energetic"). Hover a dot to see the track name, mood, and genre.

### Inferred AI Models

Click any track (liked or similar) to load its full Cyanite audio analysis in the panel at the bottom. 23 model outputs are shown as a JSON summary: genre, subgenre, mood, BPM, key, instruments, character, valence/arousal, era, music-for, and more.

---

## Project structure

```
├── src/
│   ├── api/
│   │   ├── app.py              # Bottle API server — Cyanite + OpenAI proxy
│   │   └── requirements.txt
│   └── client/
│       └── src/
│           ├── App.vue             # Main UI: users, liked tracks, similar tracks, map
│           ├── components/
│           │   ├── RecommendationMap.vue   # SVG mood map
│           │   ├── mapUtils.ts             # Map geometry + diff-label logic
│           │   └── cyaniteApi.ts           # Cyanite tagging calls (used by map)
│           └── lib/
│               ├── cyanite.ts      # Similarity search + model output fetching
│               ├── openai.ts       # GPT explanation + filter generation calls
│               ├── jamendo.ts      # Jamendo display-name fetching
│               ├── tracks.ts       # Local track data (CSV parsed at build time)
│               └── users.ts        # Local user data (CSV parsed at build time)
├── data/
│   ├── tracks.csv      # track_id, cyanite_id, name, artist_name, duration, license_ccurl
│   └── users.csv       # user_id, liked_track_ids (space-separated Jamendo IDs)
├── guides/             # Cyanite API endpoint guides + tag vocabulary reference
├── Makefile            # run / debug targets
└── .env.sample         # Environment variable template
```

---

## Data notes

Two ID spaces:

| ID | Used for |
|---|---|
| `track_id` | Jamendo track ID — audio URL, joining `users.csv` to `tracks.csv` |
| `cyanite_id` (`libtr_…`) | Cyanite API — similarity search, model outputs |

Audio URL (no API key needed):
```
https://prod-1.storage.jamendo.com/download/track/{track_id}/mp32/
```

The local data pack covers 10,561 tracks. The Cyanite catalog spans ~357k tracks — similar-track results may include tracks outside the local pack. When that happens, the app fetches display names from the Jamendo public API and shows the Jamendo track ID as a fallback.

---

Both the backend (similarity/search) and the frontend (model outputs via Vite proxy) apply in-memory caches per session.

---

## License

Code and docs: MIT ([LICENSE](LICENSE)).
Data pack: see [DATA_LICENSE.md](DATA_LICENSE.md) — Creative Commons music, pseudonymized profiles, event-use only.
Cyanite API data and model outputs: [CHALLENGE_AGREEMENT.md](CHALLENGE_AGREEMENT.md)

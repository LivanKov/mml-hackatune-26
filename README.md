# Sounds Like You

**Cyanite challenge for HACKATUNE 2026 (Munich Music Labs).**

Build a music discovery experience on the Cyanite API that recommends tracks based on
how they actually sound, driven by natural language, seed tracks, and a listener's
taste, rather than by what other people listened to. Every recommendation should be
explainable, so a user can ask "why this track?" and get a clear answer grounded in
Cyanite's audio tags.

Read the full brief in [CHALLENGE.md](CHALLENGE.md).

## What's in this repo

| Path | What it is |
|---|---|
| `CHALLENGE.md` | The challenge: what to build, ideas, and judging criteria |
| `CHALLENGE_AGREEMENT.md` | Terms for participating in the Cyanite challenge (accepted at registration) |
| `data/` | The data pack (taste profiles + track display info) |
| `guides/` | Cyanite API guides: quick start, model outputs, and tag vocabularies |
| `.env.sample` | Template for your Cyanite API key |
| `LICENSE` | MIT, for the code and docs in this repo |
| `DATA_LICENSE.md` | Terms for the data pack (Creative Commons music, pseudonymized profiles) |

## Getting started

1. Clone this repo.
2. Copy the env template and add your Cyanite API key (handed out by the organizers at the event):
   ```bash
   cp .env.sample .env
   # then edit .env and set CYANITE_API_KEY
   ```
3. Read [CHALLENGE.md](CHALLENGE.md) and the [Cyanite API quick start](guides/quick_start.md); skim the [tag vocabularies](guides/tag_vocabularies.md).
4. Explore `data/` (see below) and start querying the Cyanite API by track ID or text prompt.

For the Cyanite API itself (authentication, search, fetching tags by track ID), see the
guides in [`guides/`](guides/): [quick start](guides/quick_start.md) and
[model outputs](guides/model_outputs.md).

## The data pack

Everything is restricted to tracks that are indexed in Cyanite, so any track ID you see
is queryable.

| File | Columns | Notes |
|---|---|---|
| `data/users.csv` | `user_id, liked_track_ids` | Pseudonymized user profiles (numeric IDs only). `liked_track_ids` is a space-separated list of in-catalog track IDs, e.g. `df["liked_track_ids"].str.split()` |
| `data/tracks.csv` | `track_id, name, artist_name, duration` | Display info for the tracks referenced by the user profiles |

Use the user profiles as seeds for content-based taste profiles (the sound of what a
user likes), not as collaborative-filtering / co-listening signals. See
[DATA_LICENSE.md](DATA_LICENSE.md) for music attribution and data-use terms.

### Audio

Audio is available as public MP3 for any track at a
deterministic URL, so you can fetch audio for any catalog or search-result track ID:

```
https://prod-1.storage.jamendo.com/download/track/391816/mp32/
```

Replace `<track_id>` with the numeric ID (no API key needed). A small number of tracks
that disallow download on Jamendo may not resolve.

## Cyanite API in one line

Search returns ranked track IDs (free-text prompt search or similar-by-ID, with tag
filtering); you then fetch each result's tags from the Tagging API by track ID. There
are no raw embeddings or vectors. See [CHALLENGE.md](CHALLENGE.md) for the full loop.

## Terms and licenses

- Participating in the Cyanite challenge means accepting [CHALLENGE_AGREEMENT.md](CHALLENGE_AGREEMENT.md). Acceptance is recorded by Munich Music Labs at registration; the copy here is the reference text.
- Code and docs: MIT ([LICENSE](LICENSE)). Data pack: see [DATA_LICENSE.md](DATA_LICENSE.md).

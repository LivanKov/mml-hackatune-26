"""
Music recommendation and 2D visualization utilities.

Core functions (importable by other modules):
    get_user_seeds(user_id, ...)          -> list of cyanite IDs from a user's liked tracks
    recommend_from_seeds(ids, session)    -> ranked [{track, score}]
    recommend_from_prompt(query, session) -> ranked [{track, score}]
    enrich(items, session)                -> items with tag data attached
    to_vue_flow_nodes(items)              -> Vue Flow node list, positioned by valence/arousal

CLI:
    python recommender.py --user 545127
    python recommender.py --seed libtr_...
    python recommender.py --prompt "dark cinematic tension"
    All accept --limit N, --output FILE, --no-enrich
"""
import os
import csv
import sys
import json
import random
import argparse
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://rest-api.cyanite.ai/v1"
ENRICH_MODELS = ["ValenceArousalV2", "MoodSimpleV2", "MainGenreV2", "BpmV2", "AutoDescriptionV2"]


# ── Data helpers ──────────────────────────────────────────────────────────────

def _find(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"None of {paths} found")

def load_tracks(path=None):
    """Return {jamendo_id: cyanite_id} and {cyanite_id: {name, artist_name, ...}}."""
    p = path or _find(["data/tracks.csv", "../data/tracks.csv"])
    jamendo_to_cyanite = {}
    meta = {}
    with open(p) as f:
        for row in csv.DictReader(f):
            jamendo_to_cyanite[row["track_id"]] = row["cyanite_id"]
            meta[row["cyanite_id"]] = {
                "jamendo_id": row["track_id"],
                "name": row.get("name", ""),
                "artist_name": row.get("artist_name", ""),
                "duration": row.get("duration", ""),
            }
    return jamendo_to_cyanite, meta

def load_users(path=None):
    """Return {user_id: [jamendo_id, ...]}."""
    p = path or _find(["data/users.csv", "../data/users.csv"])
    users = {}
    with open(p) as f:
        for row in csv.DictReader(f):
            users[row["user_id"]] = row["liked_track_ids"].split()
    return users


def get_user_seeds(user_id, users=None, jamendo_to_cyanite=None, max_seeds=10, strategy="random"):
    """
    Resolve a user's liked tracks to Cyanite IDs for use as seeds.

    strategy:
        "random"  – pick max_seeds at random (fast, varied)
        "first"   – take the first max_seeds (stable across calls)

    Returns a list of up to max_seeds cyanite IDs.
    Only IDs present in the data pack (tracks.csv) are usable.
    """
    if users is None or jamendo_to_cyanite is None:
        j2c, _ = load_tracks()
        u = load_users()
        jamendo_to_cyanite = jamendo_to_cyanite or j2c
        users = users or u

    liked = users.get(str(user_id), [])
    cyanite_ids = [jamendo_to_cyanite[j] for j in liked if j in jamendo_to_cyanite]

    if strategy == "random" and len(cyanite_ids) > max_seeds:
        return random.sample(cyanite_ids, max_seeds)
    return cyanite_ids[:max_seeds]


# ── Search ────────────────────────────────────────────────────────────────────

def recommend_from_seeds(cyanite_ids, session, limit=20, metadata_filter=None):
    """
    Find tracks similar to the given seed IDs (up to 10).
    Returns ranked [{track: {id, title}, score}].
    """
    body = {"tracks": [{"id": tid} for tid in cyanite_ids[:10]]}
    if metadata_filter:
        body["metadataFilter"] = metadata_filter
    resp = session.post(
        f"{BASE_URL}/private-alpha/library-tracks/similar",
        params={"limit": limit}, json=body, timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


def recommend_from_prompt(query, session, limit=20, metadata_filter=None):
    """
    Find tracks matching a text prompt.
    Returns ranked [{track: {id, title}, score}].
    """
    body = {"query": query}
    if metadata_filter:
        body["metadataFilter"] = metadata_filter
    resp = session.post(
        f"{BASE_URL}/private-alpha/library-tracks/search",
        params={"limit": limit}, json=body, timeout=60,
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


# ── Enrichment ────────────────────────────────────────────────────────────────

def _fetch_tags(track_id, session, models):
    params = [("model", m) for m in models]
    resp = session.get(f"{BASE_URL}/library-tracks/{track_id}/models", params=params, timeout=60)
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return {mo["version"]: mo for mo in items}


def enrich(items, session, models=None, track_meta=None):
    """
    Fetch tag data for each search result and attach it under item["tags"].
    Attaches track metadata (name, artist) from the data pack if available.

    items: [{track: {id, title}, score}]  (mutated in place, also returned)
    """
    models = models or ENRICH_MODELS
    for item in items:
        track = item.get("track", item)
        track_id = track.get("id")
        item["tags"] = _fetch_tags(track_id, session, models)
        if track_meta and track_id in track_meta:
            item["meta"] = track_meta[track_id]
    return items


# ── Vue Flow output ───────────────────────────────────────────────────────────

def to_vue_flow_nodes(items, canvas_width=800, canvas_height=600, seed_ids=None):
    """
    Convert enriched recommendation items to Vue Flow node format.

    Position is derived from ValenceArousalV2 (valence → x, arousal → y).
    Falls back to a grid layout if ValenceArousalV2 is not in the tags.

    Returns a list of Vue Flow node dicts:
        {id, position: {x, y}, type, data: {score, mood, genre, bpm, description, ...}}
    """
    seed_ids = set(seed_ids or [])
    nodes = []

    for i, item in enumerate(items):
        track = item.get("track", item)
        track_id = track.get("id", f"track_{i}")
        score = item.get("score")
        tags = item.get("tags", {})
        meta = item.get("meta", {})

        # position from valence/arousal
        va = tags.get("ValenceArousalV2", {})
        va_scores = va.get("scores", {})
        if "valence" in va_scores and "arousal" in va_scores:
            # map [-1, 1] -> [margin, canvas - margin]
            margin = 40
            x = (va_scores["valence"] + 1) / 2 * (canvas_width - 2 * margin) + margin
            # arousal: high energy at top (invert y)
            y = (1 - (va_scores["arousal"] + 1) / 2) * (canvas_height - 2 * margin) + margin
        else:
            # grid fallback
            cols = 5
            x = (i % cols) * (canvas_width / cols) + 40
            y = (i // cols) * 120 + 40

        mood_mo = tags.get("MoodSimpleV2", {})
        genre_mo = tags.get("MainGenreV2", {})
        bpm_mo = tags.get("BpmV2", {})
        desc_mo = tags.get("AutoDescriptionV2", {})

        nodes.append({
            "id": track_id,
            "type": "seed" if track_id in seed_ids else "recommendation",
            "position": {"x": round(x, 1), "y": round(y, 1)},
            "data": {
                "score": score,
                "jamendo_id": meta.get("jamendo_id") or _jamendo_from_title(track.get("title")),
                "name": meta.get("name", ""),
                "artist": meta.get("artist_name", ""),
                "mood": mood_mo.get("tags", []),
                "genre": genre_mo.get("tags", []),
                "bpm": bpm_mo.get("tag"),
                "valence": va_scores.get("valence"),
                "arousal": va_scores.get("arousal"),
                "energy_level": va.get("energyLevel"),
                "description": desc_mo.get("description", ""),
            },
        })

    return nodes


def _jamendo_from_title(title):
    if title and ".mp3" in title:
        return title.split(".mp3")[0]
    return None


# ── CLI ───────────────────────────────────────────────────────────────────────

def _make_session():
    api_key = os.environ.get("CYANITE_API_KEY")
    if not api_key:
        sys.exit("CYANITE_API_KEY not set. Copy .env.sample to .env and add your key.")
    s = requests.Session()
    s.headers["x-api-key"] = api_key
    return s


def main():
    parser = argparse.ArgumentParser(description="Taste-based music recommendations.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--user", metavar="USER_ID", help="recommend from a user's liked tracks")
    group.add_argument("--seed", metavar="CYANITE_ID", action="append", dest="seeds",
                       help="recommend from one or more seed tracks (repeat for multiple)")
    group.add_argument("--prompt", metavar="TEXT", help="recommend from a text prompt")
    parser.add_argument("--limit", type=int, default=20, help="number of results (default 20)")
    parser.add_argument("--no-enrich", action="store_true", help="skip tag fetching (no visualization data)")
    parser.add_argument("--output", "-o", metavar="FILE", nargs="?", const="", default="",
                        help="write Vue Flow nodes JSON to FILE (default: recommendations.json)")
    args = parser.parse_args()

    session = _make_session()
    j2c, track_meta = load_tracks()

    seed_ids = []
    if args.user:
        users = load_users()
        seed_ids = get_user_seeds(args.user, users=users, jamendo_to_cyanite=j2c)
        if not seed_ids:
            sys.exit(f"User {args.user!r} not found or has no resolvable liked tracks.")
        print(f"User {args.user}: {len(seed_ids)} seeds")
        items = recommend_from_seeds(seed_ids, session, limit=args.limit)
    elif args.seeds:
        seed_ids = args.seeds
        items = recommend_from_seeds(seed_ids, session, limit=args.limit)
    else:
        items = recommend_from_prompt(args.prompt, session, limit=args.limit)

    print(f"{len(items)} recommendations:")
    for it in items:
        t = it.get("track", it)
        print(f"  {it.get('score', ''):.3f}  {t.get('id')}  {t.get('title', '')}")

    if not args.no_enrich:
        print("Fetching tags…")
        enrich(items, session, track_meta=track_meta)
        nodes = to_vue_flow_nodes(items, seed_ids=seed_ids)
        out_path = args.output or "recommendations.json"
        with open(out_path, "w") as f:
            json.dump(nodes, f, indent=2)
        print(f"Wrote {len(nodes)} Vue Flow nodes → {out_path}")


if __name__ == "__main__":
    main()

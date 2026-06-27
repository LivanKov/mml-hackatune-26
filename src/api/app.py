from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bottle import Bottle, HTTPResponse, request, response, run

MODEL = "gpt-5.5"
REASONING_EFFORT = "none"
TEXT_VERBOSITY="low"

APP_DIR = Path(__file__).resolve().parent
REPO_ROOT = APP_DIR.parents[1]
CYANITE_BASE_URL = "https://rest-api.cyanite.ai/v1"
OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LIMIT = 10
MAX_LIMIT = 50
MAX_SEED_TRACKS = 5

app = Bottle()


class ApiError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            os.environ.setdefault(key, value)


for env_path in (REPO_ROOT / ".env", APP_DIR / ".env"):
    load_env_file(env_path)


def json_response(payload: Any, status_code: int = 200) -> HTTPResponse:
    return HTTPResponse(
        body=json.dumps(payload),
        status=status_code,
        headers={"content-type": "application/json"},
    )


def get_json_body() -> dict[str, Any]:
    payload = request.json
    if payload is None:
        raise ApiError(400, "Request body must be valid JSON.")
    if not isinstance(payload, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return payload


def parse_track_ids(payload: dict[str, Any]) -> list[str]:
    raw_track_ids = payload.get("trackIds")
    if not isinstance(raw_track_ids, list):
        raise ApiError(400, "trackIds must be a list.")

    if not 1 <= len(raw_track_ids) <= MAX_SEED_TRACKS:
        raise ApiError(400, "Select between 1 and 10 tracks.")

    track_ids: list[str] = []
    for raw_track_id in raw_track_ids:
        if not isinstance(raw_track_id, str):
            raise ApiError(400, "Track IDs must be strings.")
        if not raw_track_id.startswith("libtr_"):
            raise ApiError(400, "Track IDs must be Cyanite library track IDs.")
        track_ids.append(raw_track_id)

    return track_ids


def parse_limit(payload: dict[str, Any]) -> int:
    raw_limit = payload.get("limit", DEFAULT_LIMIT)
    if isinstance(raw_limit, bool) or not isinstance(raw_limit, (int, float)):
        raise ApiError(400, "limit must be a number.")

    return min(max(int(raw_limit), 1), MAX_LIMIT)


def parse_json_text(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"raw": text}


def post_cyanite_json(path: str, query: dict[str, Any], payload: dict[str, Any]) -> tuple[int, Any]:
    api_key = os.environ.get("CYANITE_API_KEY", "").strip()
    if not api_key:
        raise ApiError(500, "CYANITE_API_KEY is not configured.")

    base_url = CYANITE_BASE_URL.rstrip("/")
    url = f"{base_url}{path}?{urlencode(query)}"
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
        },
    )

    try:
        with urlopen(req, timeout=60) as res:
            return res.status, parse_json_text(res.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, parse_json_text(error.read().decode("utf-8"))
    except URLError as error:
        reason = getattr(error, "reason", error)
        raise ApiError(502, f"Could not reach Cyanite API: {reason}") from error


def post_openai_json(path: str, payload: dict[str, Any]) -> tuple[int, Any]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ApiError(500, "OPENAI_API_KEY is not configured.")

    base_url = OPENAI_BASE_URL.rstrip("/")
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        f"{base_url}{path}",
        data=body,
        method="POST",
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
    )

    try:
        with urlopen(req, timeout=60) as res:
            return res.status, parse_json_text(res.read().decode("utf-8"))
    except HTTPError as error:
        return error.code, parse_json_text(error.read().decode("utf-8"))
    except URLError as error:
        reason = getattr(error, "reason", error)
        raise ApiError(502, f"Could not reach OpenAI API: {reason}") from error


def extract_openai_output_text(data: Any) -> str:
    if not isinstance(data, dict):
        return ""

    output_text = data.get("output_text")
    if isinstance(output_text, str):
        return output_text

    parts: list[str] = []
    for output_item in data.get("output", []):
        if not isinstance(output_item, dict):
            continue
        for content_item in output_item.get("content", []):
            if not isinstance(content_item, dict):
                continue
            text = content_item.get("text")
            if isinstance(text, str):
                parts.append(text)

    return "".join(parts)


def build_openai_structured_test_payload() -> dict[str, Any]:
    return {
        "model": MODEL,
        "reasoning": {
            "effort": REASONING_EFFORT,
        },
        "instructions": (
            "Return a tiny service health check. Keep the message short and practical."
        ),
        "input": "Confirm that the OpenAI structured output test route is working.",
        "text": {
            "verbosity": TEXT_VERBOSITY,
            "format": {
                "type": "json_schema",
                "name": "openai_structured_output_test",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "ok": {"type": "boolean"},
                        "status": {
                            "type": "string",
                            "enum": ["pass", "warning", "fail"],
                        },
                        "message": {"type": "string"},
                        "next_steps": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["ok", "status", "message", "next_steps"],
                },
            },
        },
    }


def normalize_similar_tracks_response(
    data: Any,
    seed_track_ids: list[str],
    limit: int,
) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {
            "items": [],
            "pageInfo": {},
            "seedTrackIds": seed_track_ids,
            "limit": limit,
        }

    items = []
    for item in data.get("items", []):
        if not isinstance(item, dict):
            continue

        track = item.get("track", item)
        if not isinstance(track, dict) or not isinstance(track.get("id"), str):
            continue

        normalized_item: dict[str, Any] = {
            "track": {
                "id": track["id"],
            },
        }

        if isinstance(track.get("title"), str):
            normalized_item["track"]["title"] = track["title"]

        score = item.get("score")
        if isinstance(score, (int, float)) and not isinstance(score, bool):
            normalized_item["score"] = score

        items.append(normalized_item)

    return {
        "items": items,
        "pageInfo": data.get("pageInfo", {}),
        "seedTrackIds": seed_track_ids,
        "limit": limit,
    }


@app.hook("after_request")
def add_cors_headers() -> None:
    response.headers["Access-Control-Allow-Origin"] = os.environ.get("CLIENT_ORIGIN", "*")
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "content-type"


@app.route("/api/<_path:path>", method="OPTIONS")
def options(_path: str) -> HTTPResponse:
    return HTTPResponse(status=204)


@app.get("/api/health")
def health() -> HTTPResponse:
    return json_response({
        "ok": True,
        "cyaniteConfigured": bool(os.environ.get("CYANITE_API_KEY", "").strip()),
        "openaiConfigured": bool(os.environ.get("OPENAI_API_KEY", "").strip()),
    })


@app.post("/api/similar-tracks")
def similar_tracks() -> HTTPResponse:
    try:
        payload = get_json_body()
        track_ids = parse_track_ids(payload)
        limit = parse_limit(payload)
        status_code, cyanite_data = post_cyanite_json(
            "/private-alpha/library-tracks/similar",
            {"limit": limit},
            {"tracks": [{"id": track_id} for track_id in track_ids]},
        )

        if status_code < 200 or status_code >= 300:
            return json_response(cyanite_data, status_code)

        return json_response(normalize_similar_tracks_response(cyanite_data, track_ids, limit))
    except ApiError as error:
        return json_response({"error": error.message}, error.status_code)


@app.post("/api/openai-test")
def openai_test() -> HTTPResponse:
    try:
        payload = build_openai_structured_test_payload()
        status_code, openai_data = post_openai_json("/responses", payload)

        if status_code < 200 or status_code >= 300:
            return json_response({
                "error": "OpenAI API request failed.",
                "details": openai_data,
            }, status_code)

        output_text = extract_openai_output_text(openai_data)
        if not output_text:
            raise ApiError(502, "OpenAI response did not include output text.")

        try:
            result = json.loads(output_text)
        except json.JSONDecodeError as error:
            raise ApiError(502, "OpenAI response was not valid JSON.") from error

        return json_response({
            "model": openai_data.get("model", payload["model"])
            if isinstance(openai_data, dict)
            else payload["model"],
            "result": result,
            "usage": openai_data.get("usage") if isinstance(openai_data, dict) else None,
        })
    except ApiError as error:
        return json_response({"error": error.message}, error.status_code)


def main() -> None:
    host = os.environ.get("API_HOST", os.environ.get("BACKEND_HOST", "localhost"))
    port = int(os.environ.get("API_PORT", os.environ.get("BACKEND_PORT", "8001")))
    debug = os.environ.get("BOTTLE_DEBUG") == "1"
    run(app=app, host=host, port=port, debug=debug, reloader=False)


if __name__ == "__main__":
    main()

import json
import os
import time
import uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
PUBLICATIONS_DIR = ROOT / "publicaciones"
IMAGES_DIR = PUBLICATIONS_DIR / "images"
VIDEOS_DIR = PUBLICATIONS_DIR / "videos"
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".avi"}
OWNER_DELETE_KEY = os.getenv("OWNER_DELETE_KEY", "INDIE_CREATE_OWNER_2026")
SETTINGS_PATH = ROOT / "settings.json"
DEFAULT_SETTINGS = {
    "gameIcon": "/img/game/gameminecraft.png",
    "deleteEnabled": True,
}

PUBLICATIONS_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)
VIDEOS_DIR.mkdir(exist_ok=True)


def is_authorized_delete(key_value: str) -> bool:
    return (key_value or "") == OWNER_DELETE_KEY


def load_settings():
    if not SETTINGS_PATH.exists():
        save_settings(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)
    try:
        with SETTINGS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError
        merged = dict(DEFAULT_SETTINGS)
        merged.update(data)
        merged["deleteEnabled"] = bool(merged.get("deleteEnabled", True))
        merged["gameIcon"] = str(merged.get("gameIcon") or DEFAULT_SETTINGS["gameIcon"])
        return merged
    except Exception:
        save_settings(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)


def save_settings(payload):
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(payload, dict):
        settings.update(payload)
    settings["deleteEnabled"] = bool(settings.get("deleteEnabled", True))
    settings["gameIcon"] = str(settings.get("gameIcon") or DEFAULT_SETTINGS["gameIcon"])
    with SETTINGS_PATH.open("w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)
    return settings


def parse_multipart_form(raw_body: bytes, content_type: str):
    if "multipart/form-data" not in content_type.lower():
        return {}

    parts = content_type.split(";")
    boundary = None
    for part in parts[1:]:
        key, _, value = part.partition("=")
        if key.strip().lower() == "boundary":
            boundary = value.strip().strip('"')
            break

    if not boundary:
        return {}

    boundary_bytes = ("--" + boundary).encode("utf-8")
    form_data = {}
    files = {}

    chunks = raw_body.split(boundary_bytes)
    for chunk in chunks:
        if not chunk or chunk in (b"--\r\n", b"--\n", b"--"):
            continue

        block = chunk.strip(b"\r\n")
        if not block:
            continue

        if b"\r\n\r\n" in block:
            header_bytes, body = block.split(b"\r\n\r\n", 1)
        elif b"\n\n" in block:
            header_bytes, body = block.split(b"\n\n", 1)
        else:
            continue

        header_text = header_bytes.decode("utf-8", errors="replace")
        headers = {}
        for line in header_text.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.strip().lower()] = value.strip()

        content_disposition = headers.get("content-disposition", "")
        name = ""
        filename = ""
        for item in content_disposition.split(";"):
            item = item.strip()
            if item.lower().startswith("name="):
                name = item.split("=", 1)[1].strip('"')
            elif item.lower().startswith("filename="):
                filename = item.split("=", 1)[1].strip('"')

        if not name:
            continue

        value = body
        if body.endswith(b"\r\n"):
            value = body[:-2]
        elif body.endswith(b"\n"):
            value = body[:-1]

        if filename:
            files[name] = {
                "filename": filename,
                "content": value,
            }
        else:
            form_data[name] = value.decode("utf-8", errors="replace")

    result = dict(form_data)
    for name, meta in files.items():
        result[name] = meta["content"]
        result[f"{name}_filename"] = meta["filename"]
    return result


def get_publication_timestamp(publication):
    if not isinstance(publication, dict):
        return 0

    for key in ("createdAt", "publishedAt"):
        value = publication.get(key)
        if value in (None, ""):
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return 0


def normalize_publication(publication):
    if not isinstance(publication, dict):
        return {}

    normalized = dict(publication)
    if "createdAt" not in normalized and "publishedAt" in normalized:
        normalized["createdAt"] = normalized["publishedAt"]

    normalized["title"] = str(normalized.get("title") or "")
    normalized["description"] = normalized.get("description") if normalized.get("description") is not None else ""
    normalized["image"] = normalized.get("image") or None
    normalized["video"] = normalized.get("video") or None
    normalized["likes"] = int(normalized.get("likes", 0) or 0)
    normalized["dislikes"] = int(normalized.get("dislikes", 0) or 0)

    votes = normalized.get("votes")
    if isinstance(votes, dict):
        normalized["votes"] = {str(k): str(v).lower() for k, v in votes.items() if str(v).lower() in {"like", "dislike"}}
    else:
        normalized["votes"] = {}

    return normalized


def load_publications():
    items = []
    for file_path in sorted(PUBLICATIONS_DIR.glob("*.json")):
        try:
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                items.append(normalize_publication(data))
        except Exception:
            continue
    return sorted(items, key=lambda item: get_publication_timestamp(item), reverse=True)


def save_publication(payload):
    publication = dict(payload or {})
    publication_id = publication.get("id") or f"pub-{uuid.uuid4().hex}"
    publication["id"] = publication_id
    timestamp = get_publication_timestamp(publication)
    if not timestamp:
        timestamp = int(time.time() * 1000)
    publication["createdAt"] = timestamp
    publication["publishedAt"] = publication.get("publishedAt") or timestamp
    publication["likes"] = int(publication.get("likes", 0) or 0)
    publication["dislikes"] = int(publication.get("dislikes", 0) or 0)
    votes = publication.get("votes")
    if not isinstance(votes, dict):
        publication["votes"] = {}
    else:
        publication["votes"] = {str(key): str(value).lower() for key, value in votes.items() if str(value).lower() in {"like", "dislike"}}
    file_path = PUBLICATIONS_DIR / f"{publication_id}.json"
    with file_path.open("w", encoding="utf-8") as f:
        json.dump(publication, f, ensure_ascii=False, indent=2)
    return publication_id


def vote_publication(publication_id, reaction, user_id=None):
    file_path = PUBLICATIONS_DIR / f"{publication_id}.json"
    if not file_path.exists():
        return None

    with file_path.open("r", encoding="utf-8") as f:
        publication = json.load(f)

    if not isinstance(publication, dict):
        return None

    reaction = (reaction or "").strip().lower()
    if reaction not in {"like", "dislike"}:
        return None

    user_key = str(user_id or "anonymous").strip()
    if not user_key:
        user_key = "anonymous"

    publication["likes"] = int(publication.get("likes", 0) or 0)
    publication["dislikes"] = int(publication.get("dislikes", 0) or 0)
    votes = publication.get("votes")
    if not isinstance(votes, dict):
        votes = {}
    publication["votes"] = {str(k): str(v).lower() for k, v in votes.items() if str(v).lower() in {"like", "dislike"}}

    current_vote = publication["votes"].get(user_key)
    if current_vote == reaction:
        if current_vote == "like":
            publication["likes"] = max(0, publication["likes"] - 1)
        elif current_vote == "dislike":
            publication["dislikes"] = max(0, publication["dislikes"] - 1)
        publication["votes"].pop(user_key, None)
        save_publication(publication)
        return publication

    if current_vote == "like":
        publication["likes"] -= 1
    elif current_vote == "dislike":
        publication["dislikes"] -= 1

    if reaction == "like":
        publication["likes"] += 1
    else:
        publication["dislikes"] += 1

    publication["votes"][user_key] = reaction
    save_publication(publication)
    return publication


def delete_publication(publication_id):
    file_path = PUBLICATIONS_DIR / f"{publication_id}.json"
    if not file_path.exists():
        return False

    try:
        with file_path.open("r", encoding="utf-8") as f:
            publication = json.load(f)
    except Exception:
        publication = {}

    image_path = publication.get("image")
    if image_path and image_path.startswith("/publicaciones/images/"):
        filename = image_path.split("/publicaciones/images/")[-1]
        local_file = IMAGES_DIR / filename
        if local_file.exists():
            local_file.unlink()

    video_path = publication.get("video")
    if video_path and video_path.startswith("/publicaciones/videos/"):
        filename = video_path.split("/publicaciones/videos/")[-1]
        local_file = VIDEOS_DIR / filename
        if local_file.exists():
            local_file.unlink()

    file_path.unlink(missing_ok=True)
    return True


class PublicationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/publicaciones":
            self.send_json(load_publications())
            return

        if parsed.path == "/api/config":
            self.send_json(load_settings())
            return

        if parsed.path.startswith("/publicaciones/images/") or parsed.path.startswith("/publicaciones/videos/"):
            requested = ROOT / parsed.path.lstrip("/")
            if requested.exists() and requested.is_file():
                self.send_response(200)
                self.send_header("Content-Type", self.guess_type(str(requested)))
                self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                self.end_headers()
                with requested.open("rb") as f:
                    self.wfile.write(f.read())
                return
            self.send_error(404, "Archivo no encontrado")
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            key_value = self.headers.get("X-Admin-Key", "") or dict(parse_qs(parsed.query)).get("key", [""])[0]
            if not is_authorized_delete(key_value):
                self.send_error(403, "No autorizado")
                return

            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            try:
                payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                payload = {}
            settings = save_settings(payload)
            self.send_json(settings, status=200)
            return

        if parsed.path != "/api/publicaciones":
            self.send_error(404, "Ruta no encontrada")
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type.lower():
            self.send_error(400, "Se espera multipart/form-data")
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        form = parse_multipart_form(body, content_type)

        title = (form.get("title") or "").strip()
        description = (form.get("description") or "").strip()
        image_url = (form.get("imageUrl") or "").strip()
        video_url = (form.get("videoUrl") or "").strip()
        image_file_data = form.get("image")
        video_file_data = form.get("video")

        has_image_content = bool(image_url) or (isinstance(image_file_data, (bytes, bytearray)) and bool(image_file_data))
        has_description_content = bool(description)
        has_video_content = bool(video_url) or (isinstance(video_file_data, (bytes, bytearray)) and bool(video_file_data))

        if not title:
            self.send_error(400, "El título es obligatorio")
            return

        if not (has_description_content or has_image_content or has_video_content):
            self.send_error(400, "La publicación debe incluir una descripción, una imagen o un video")
            return

        if image_url and not image_url.startswith(("http://", "https://")):
            self.send_error(400, "La URL de la imagen debe comenzar con http:// o https://")
            return

        if video_url and not video_url.startswith(("http://", "https://")):
            self.send_error(400, "La URL del video debe comenzar con http:// o https://")
            return

        image_value = image_url
        if isinstance(image_file_data, (bytes, bytearray)) and image_file_data:
            filename = form.get("image_filename") or "image"
            extension = Path(filename).suffix.lower()
            if extension not in ALLOWED_IMAGE_EXTENSIONS:
                self.send_error(400, "El archivo debe ser una imagen válida: PNG, JPG, JPEG, WEBP o GIF")
                return

            image_name = f"{uuid.uuid4().hex}{extension}"
            image_path = IMAGES_DIR / image_name
            image_path.write_bytes(image_file_data)
            image_value = f"/publicaciones/images/{image_name}"

        video_value = video_url
        if isinstance(video_file_data, (bytes, bytearray)) and video_file_data:
            filename = form.get("video_filename") or "video"
            extension = Path(filename).suffix.lower()
            if extension not in ALLOWED_VIDEO_EXTENSIONS:
                self.send_error(400, "El archivo debe ser un video válido: MP4, WEBM, OGG, MOV o AVI")
                return

            video_name = f"{uuid.uuid4().hex}{extension}"
            video_path = VIDEOS_DIR / video_name
            video_path.write_bytes(video_file_data)
            video_value = f"/publicaciones/videos/{video_name}"

        publication_id = f"pub-{uuid.uuid4().hex}"
        publication = {
            "id": publication_id,
            "title": title,
            "description": description,
            "image": image_value or None,
            "video": video_value or None,
            "createdAt": int(time.time() * 1000),
            "publishedAt": int(time.time() * 1000),
        }
        save_publication(publication)
        self.send_json(publication, status=201)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/publicaciones/"):
            publication_id = parsed.path.rsplit("/", 1)[-1]
            key_value = self.headers.get("X-Delete-Key", "") or dict(parse_qs(parsed.query)).get("key", [""])[0]
            if key_value and is_authorized_delete(key_value):
                if delete_publication(publication_id):
                    self.send_json({"ok": True, "id": publication_id})
                else:
                    self.send_error(404, "Publicación no encontrada")
                return

            reaction = dict(parse_qs(parsed.query)).get("reaction", [""])[0]
            user_id = dict(parse_qs(parsed.query)).get("userId", [""])[0]
            updated = vote_publication(publication_id, reaction, user_id)
            if updated is None:
                self.send_error(400, "Reacción inválida")
                return
            self.send_json(updated)
            return

        self.send_error(404, "Ruta no encontrada")

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    server = ThreadingHTTPServer(("0.0.0.0", port), PublicationHandler)
    print(f"Servidor activo en el puerto {port}")
    server.serve_forever()

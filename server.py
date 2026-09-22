import json
import os
import time
import uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Importación del cliente oficial de Supabase
from supabase import create_client, Client

ROOT = Path(__file__).resolve().parent

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".avi"}
OWNER_DELETE_KEY = os.getenv("OWNER_DELETE_KEY", "INDIE_CREATE_OWNER_2026")

# ==============================================================================
# CONFIGURACIÓN DE SUPABASE
# ==============================================================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://clsnkvvwcjoyxwzodoxr.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_tlunp4Iouiftr97Xw-ZKxQ_tfY-JC7q")

# Inicialización del cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# ==============================================================================

DEFAULT_SETTINGS = {
    "gameIcon": "/img/game/gameminecraft.png",
    "deleteEnabled": True,
}


def is_authorized_delete(key_value: str) -> bool:
    return (key_value or "") == OWNER_DELETE_KEY


def load_settings():
    try:
        response = supabase.table("settings").select("*").eq("id", "global").execute()
        if response.data:
            data = response.data[0].get("config", {})
            merged = dict(DEFAULT_SETTINGS)
            merged.update(data)
            return merged
        else:
            save_settings(DEFAULT_SETTINGS)
            return dict(DEFAULT_SETTINGS)
    except Exception as e:
        print("Error al cargar settings desde Supabase:", e)
        return dict(DEFAULT_SETTINGS)


def save_settings(payload):
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(payload, dict):
        settings.update(payload)
    settings["deleteEnabled"] = bool(settings.get("deleteEnabled", True))
    settings["gameIcon"] = str(settings.get("gameIcon") or DEFAULT_SETTINGS["gameIcon"])
    try:
        supabase.table("settings").upsert({"id": "global", "config": settings}).execute()
    except Exception as e:
        print("Error al guardar settings en Supabase:", e)
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


def upload_to_supabase_storage(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Sube un archivo al bucket 'media' de Supabase Storage y retorna su URL pública."""
    ext = Path(filename).suffix.lower()
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    path_in_bucket = f"uploads/{unique_filename}"
    
    # Subida del archivo binario
    supabase.storage.from_("media").upload(
        path=path_in_bucket,
        file=file_bytes,
        file_options={"content-type": content_type}
    )
    
    # Retornar la URL pública directa
    public_url = supabase.storage.from_("media").get_public_url(path_in_bucket)
    return public_url


def load_publications():
    try:
        response = supabase.table("publicaciones").select("*").order("createdAt", desc=True).execute()
        return response.data or []
    except Exception as e:
        print("Error al cargar publicaciones:", e)
        return []


def save_publication(payload):
    publication = dict(payload or {})
    publication_id = publication.get("id") or f"pub-{uuid.uuid4().hex}"
    publication["id"] = publication_id
    
    timestamp = publication.get("createdAt") or int(time.time() * 1000)
    publication["createdAt"] = timestamp
    publication["likes"] = int(publication.get("likes", 0) or 0)
    publication["dislikes"] = int(publication.get("dislikes", 0) or 0)
    
    if "votes" not in publication or not isinstance(publication["votes"], dict):
        publication["votes"] = {}

    try:
        supabase.table("publicaciones").upsert(publication).execute()
    except Exception as e:
        print("Error al guardar publicación:", e)
        
    return publication_id


def vote_publication(publication_id, reaction, user_id=None):
    try:
        response = supabase.table("publicaciones").select("*").eq("id", publication_id).execute()
        if not response.data:
            return None
        publication = response.data[0]
    except Exception as e:
        print("Error buscando publicación para votar:", e)
        return None

    reaction = (reaction or "").strip().lower()
    if reaction not in {"like", "dislike"}:
        return None

    user_key = str(user_id or "anonymous").strip() or "anonymous"

    publication["likes"] = int(publication.get("likes", 0) or 0)
    publication["dislikes"] = int(publication.get("dislikes", 0) or 0)
    votes = publication.get("votes") or {}

    current_vote = votes.get(user_key)
    if current_vote == reaction:
        if current_vote == "like":
            publication["likes"] = max(0, publication["likes"] - 1)
        elif current_vote == "dislike":
            publication["dislikes"] = max(0, publication["dislikes"] - 1)
        votes.pop(user_key, None)
        publication["votes"] = votes
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

    votes[user_key] = reaction
    publication["votes"] = votes
    save_publication(publication)
    return publication


def delete_publication(publication_id):
    try:
        supabase.table("publicaciones").delete().eq("id", publication_id).execute()
        return True
    except Exception as e:
        print("Error eliminando publicación:", e)
        return False


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

        image_value = image_url
        if isinstance(image_file_data, (bytes, bytearray)) and image_file_data:
            filename = form.get("image_filename") or "image.png"
            extension = Path(filename).suffix.lower()
            if extension not in ALLOWED_IMAGE_EXTENSIONS:
                self.send_error(400, "El archivo debe ser una imagen válida: PNG, JPG, JPEG, WEBP o GIF")
                return

            c_type = f"image/{extension.lstrip('.')}"
            image_value = upload_to_supabase_storage(image_file_data, filename, c_type)

        video_value = video_url
        if isinstance(video_file_data, (bytes, bytearray)) and video_file_data:
            filename = form.get("video_filename") or "video.mp4"
            extension = Path(filename).suffix.lower()
            if extension not in ALLOWED_VIDEO_EXTENSIONS:
                self.send_error(400, "El archivo debe ser un video válido: MP4, WEBM, OGG, MOV o AVI")
                return

            c_type = f"video/{extension.lstrip('.')}"
            video_value = upload_to_supabase_storage(video_file_data, filename, c_type)

        publication_id = f"pub-{uuid.uuid4().hex}"
        publication = {
            "id": publication_id,
            "title": title,
            "description": description,
            "image": image_value or None,
            "video": video_value or None,
            "createdAt": int(time.time() * 1000),
            "likes": 0,
            "dislikes": 0,
            "votes": {}
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
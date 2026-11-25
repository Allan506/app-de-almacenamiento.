from __future__ import annotations

import io
import zipfile

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)


def upload(client, headers, name="archivo.txt", data=b"hola mundo", parent_id=None, mime="text/plain"):
    files = {"file": (name, io.BytesIO(data), mime)}
    form = {"parent_id": parent_id} if parent_id else {}
    response = client.post("/api/nodes/upload", files=files, data=form, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def new_folder(client, headers, name="Carpeta", parent_id=None):
    response = client.post("/api/nodes/folder", json={"name": name, "parent_id": parent_id}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["storage"] == "local"


def test_config_exposes_dev_mode(client):
    body = client.get("/api/auth/config").json()
    assert body["dev_mode"] is True
    assert body["channel"] == "console"


def test_otp_login_and_me(client, auth):
    me = client.get("/api/auth/me", headers=auth["headers"])
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == auth["email"]
    assert body["display_name"]
    assert body["created_at"]


def test_invalid_otp_is_rejected(client):
    email = "intruso@nube.app"
    client.post("/api/auth/otp/request", json={"email": email})
    response = client.post("/api/auth/otp/verify", json={"email": email, "code": "000000"})
    assert response.status_code == 401


def test_protected_routes_require_token(client):
    assert client.get("/api/nodes").status_code == 401
    assert client.get("/api/stats").status_code == 401


def test_folder_and_upload_flow(client, auth):
    headers = auth["headers"]
    folder = new_folder(client, headers, "Documentos")
    assert folder["kind"] == "folder"

    node = upload(client, headers, "informe.txt", b"contenido de prueba", parent_id=folder["id"])
    assert node["parent_id"] == folder["id"]
    assert node["size"] == len(b"contenido de prueba")

    listing = client.get("/api/nodes", params={"parent_id": folder["id"]}, headers=headers).json()
    assert [item["name"] for item in listing["items"]] == ["informe.txt"]
    assert [crumb["name"] for crumb in listing["breadcrumb"]] == ["Documentos"]

    root = client.get("/api/nodes", headers=headers).json()
    assert "Documentos" in [item["name"] for item in root["items"]]


def test_download_returns_exact_bytes(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "datos.csv", b"a,b\n1,2\n", mime="text/csv")
    response = client.get(f"/api/nodes/{node['id']}/download", headers=headers)
    assert response.status_code == 200
    assert response.content == b"a,b\n1,2\n"
    assert "attachment" in response.headers["content-disposition"]

    media = client.post("/api/auth/media-token", headers=headers).json()["token"]
    inline = client.get(f"/api/nodes/{node['id']}/raw", params={"t": media})
    assert inline.status_code == 200
    assert inline.content == b"a,b\n1,2\n"


def test_duplicate_names_are_unique(client, auth):
    headers = auth["headers"]
    first = upload(client, headers, "duplicado.txt", b"uno")
    second = upload(client, headers, "duplicado.txt", b"dos")
    assert first["name"] != second["name"]
    assert second["name"].startswith("duplicado")


def test_rename_move_and_favorite(client, auth):
    headers = auth["headers"]
    folder = new_folder(client, headers, "Destino")
    node = upload(client, headers, "mover.txt", b"x")

    renamed = client.patch(f"/api/nodes/{node['id']}", json={"name": "renombrado.txt"}, headers=headers).json()
    assert renamed["name"] == "renombrado.txt"

    moved = client.patch(f"/api/nodes/{node['id']}", json={"parent_id": folder["id"]}, headers=headers).json()
    assert moved["parent_id"] == folder["id"]

    favorite = client.patch(f"/api/nodes/{node['id']}", json={"is_favorite": True}, headers=headers).json()
    assert favorite["is_favorite"] is True

    favorites = client.get("/api/nodes", params={"favorites": True}, headers=headers).json()
    assert "renombrado.txt" in [item["name"] for item in favorites["items"]]


def test_trash_restore_and_purge(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "temporal.txt", b"temporal")

    assert client.delete(f"/api/nodes/{node['id']}", headers=headers).status_code == 200
    active = client.get("/api/nodes", headers=headers).json()["items"]
    assert "temporal.txt" not in [item["name"] for item in active]

    trashed = client.get("/api/nodes", params={"trashed": True}, headers=headers).json()["items"]
    assert "temporal.txt" in [item["name"] for item in trashed]

    restored = client.post(f"/api/nodes/{node['id']}/restore", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None

    client.delete(f"/api/nodes/{node['id']}", headers=headers)
    assert client.delete(f"/api/nodes/{node['id']}/permanent", headers=headers).status_code == 200
    assert client.get(f"/api/nodes/{node['id']}", headers=headers).status_code == 404


def test_trashing_folder_hides_children(client, auth):
    headers = auth["headers"]
    folder = new_folder(client, headers, "Bloque")
    upload(client, headers, "dentro.txt", b"dentro", parent_id=folder["id"])

    client.delete(f"/api/nodes/{folder['id']}", headers=headers)
    root = client.get("/api/nodes", headers=headers).json()["items"]
    assert "Bloque" not in [item["name"] for item in root]

    trashed = client.get("/api/nodes", params={"trashed": True}, headers=headers).json()["items"]
    names = [item["name"] for item in trashed]
    assert "Bloque" in names
    assert "dentro.txt" not in names


def test_empty_trash(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "basura.txt", b"basura")
    client.delete(f"/api/nodes/{node['id']}", headers=headers)
    response = client.post("/api/trash/empty", headers=headers)
    assert response.status_code == 200
    assert response.json()["removed"] >= 1
    assert client.get("/api/nodes", params={"trashed": True}, headers=headers).json()["items"] == []


def test_search_and_kind_filter(client, auth):
    headers = auth["headers"]
    upload(client, headers, "foto.png", PNG, mime="image/png")
    upload(client, headers, "nota.txt", b"texto")

    found = client.get("/api/nodes", params={"search": "foto"}, headers=headers).json()["items"]
    assert [item["name"] for item in found] == ["foto.png"]

    images = client.get("/api/nodes", params={"kind": "image"}, headers=headers).json()["items"]
    assert "foto.png" in [item["name"] for item in images]
    assert "nota.txt" not in [item["name"] for item in images]


def test_stats_report_usage(client, auth):
    headers = auth["headers"]
    body = client.get("/api/stats", headers=headers).json()
    assert body["files"] >= 1
    assert body["used"] > 0
    assert any(entry["label"] == "Imagenes" for entry in body["by_type"])
    assert isinstance(body["activity"], list)


def test_quota_is_enforced(client, auth):
    headers = auth["headers"]
    big = b"0" * 600_000
    response = client.post("/api/nodes/upload", files={"file": ("grande.bin", io.BytesIO(big), "application/octet-stream")}, headers=headers)
    assert response.status_code == 413


def test_share_lifecycle_without_password(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "compartido.txt", b"contenido compartido")

    share = client.post("/api/shares", json={"node_id": node["id"]}, headers=headers).json()
    token = share["url"].rsplit("/", 1)[-1]
    assert share["has_password"] is False

    info = client.get(f"/api/public/shares/{token}").json()
    assert info["name"] == "compartido.txt"
    assert info["requires_password"] is False
    assert info["owner"]

    raw = client.get(f"/api/public/shares/{token}/raw")
    assert raw.content == b"contenido compartido"

    download = client.get(f"/api/public/shares/{token}/download")
    assert download.status_code == 200
    assert download.content == b"contenido compartido"

    shares = client.get("/api/shares", headers=headers).json()
    assert shares[0]["download_count"] >= 1

    assert client.delete(f"/api/shares/{share['id']}", headers=headers).status_code == 200
    assert client.get(f"/api/public/shares/{token}").status_code == 404


def test_share_password_protection(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "privado.txt", b"secreto")
    share = client.post("/api/shares", json={"node_id": node["id"], "password": "clave1234"}, headers=headers).json()
    token = share["url"].rsplit("/", 1)[-1]

    info = client.get(f"/api/public/shares/{token}").json()
    assert info["requires_password"] is True
    assert client.get(f"/api/public/shares/{token}/raw").status_code == 401

    wrong = client.post(f"/api/public/shares/{token}/unlock", json={"password": "incorrecta"})
    assert wrong.status_code == 401

    unlocked = client.post(f"/api/public/shares/{token}/unlock", json={"password": "clave1234"}).json()
    access = unlocked["access"]
    raw = client.get(f"/api/public/shares/{token}/raw", params={"access": access})
    assert raw.content == b"secreto"


def test_shared_folder_zip_and_listing(client, auth):
    headers = auth["headers"]
    folder = new_folder(client, headers, "Carpeta compartida")
    upload(client, headers, "uno.txt", b"uno", parent_id=folder["id"])
    upload(client, headers, "dos.txt", b"dos", parent_id=folder["id"])

    share = client.post("/api/shares", json={"node_id": folder["id"]}, headers=headers).json()
    token = share["url"].rsplit("/", 1)[-1]

    items = client.get(f"/api/public/shares/{token}/items").json()
    assert sorted(item["name"] for item in items) == ["dos.txt", "uno.txt"]

    archive = client.get(f"/api/public/shares/{token}/download")
    assert archive.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
        assert sorted(bundle.namelist()) == ["dos.txt", "uno.txt"]


def test_download_disabled_blocks_downloads(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "solo-ver.txt", b"mirar")
    share = client.post("/api/shares", json={"node_id": node["id"], "allow_download": False}, headers=headers).json()
    token = share["url"].rsplit("/", 1)[-1]

    assert client.get(f"/api/public/shares/{token}/raw").status_code == 200
    assert client.get(f"/api/public/shares/{token}/download").status_code == 403


def test_expired_share_returns_gone(client, auth):
    headers = auth["headers"]
    node = upload(client, headers, "caduca.txt", b"caduca")
    share = client.post("/api/shares", json={"node_id": node["id"], "expires_in_hours": 1}, headers=headers).json()
    token = share["url"].rsplit("/", 1)[-1]

    from datetime import timedelta

    from app.database import SessionLocal
    from app.models import Share, utcnow

    with SessionLocal() as db:
        stored = db.query(Share).filter(Share.id == share["id"]).one()
        stored.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()

    assert client.get(f"/api/public/shares/{token}").status_code == 410


def test_users_cannot_read_foreign_nodes(client, auth):
    headers = auth["headers"]
    other_email = "otro@nube.app"
    code = client.post("/api/auth/otp/request", json={"email": other_email}).json()["dev_code"]
    other_token = client.post("/api/auth/otp/verify", json={"email": other_email, "code": code}).json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    node = upload(client, headers, "mio.txt", b"privado")
    assert client.get(f"/api/nodes/{node['id']}", headers=other_headers).status_code == 404
    assert client.get(f"/api/nodes/{node['id']}/download", headers=other_headers).status_code == 404

    listing = client.get("/api/nodes", headers=other_headers).json()["items"]
    assert listing == []


def test_profile_update_and_logout(client, auth):
    headers = auth["headers"]
    updated = client.patch("/api/auth/me", json={"display_name": "Tester Pro"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "Tester Pro"

    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/session", headers=headers).status_code == 401


def test_delete_account_removes_data(client):
    email = "borrar@nube.app"
    code = client.post("/api/auth/otp/request", json={"email": email}).json()["dev_code"]
    token = client.post("/api/auth/otp/verify", json={"email": email, "code": code}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    node = upload(client, headers, "efimero.txt", b"efimero")
    assert client.delete("/api/auth/me", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.get(f"/api/nodes/{node['id']}", headers=headers).status_code == 401


def test_frontend_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Nube" in response.text

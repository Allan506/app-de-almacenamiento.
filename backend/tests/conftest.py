import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="nube-tests-"))
os.environ.update(
    {
        "DATA_DIR": str(_TMP),
        "STORAGE_BACKEND": "local",
        "OTP_DEV_MODE": "true",
        "OTP_RESEND_COOLDOWN": "0",
        "OTP_MAX_PER_HOUR": "1000",
        "DEFAULT_QUOTA_BYTES": "500000",
        "APP_URL": "http://testserver",
    }
)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP / 'test.db'}")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def fresh_database():
    from app.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(scope="session")
def client(fresh_database):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def auth(client):
    email = "tester@nube.app"
    code = client.post("/api/auth/otp/request", json={"email": email}).json()["dev_code"]
    result = client.post("/api/auth/otp/verify", json={"email": email, "code": code}).json()
    return {"email": email, "token": result["access_token"], "headers": {"Authorization": f"Bearer {result['access_token']}"}}

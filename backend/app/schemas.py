from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(microsecond=0).isoformat() + "Z"


class OtpRequest(BaseModel):
    email: EmailStr


class OtpRequestResult(BaseModel):
    message: str
    channel: str
    expires_in: int
    resend_after: int
    dev_code: str | None = None
    is_new_user: bool = False


class OtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    color: str
    quota_bytes: int
    created_at: datetime
    last_login_at: datetime | None

    @field_serializer("created_at", "last_login_at")
    def serialize_dt(self, value: datetime | None, _info):
        return _iso(value)


class AuthResult(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    is_new_user: bool = False


class UserUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class NodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: str | None
    name: str
    kind: str
    size: int
    mime_type: str
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    has_share: bool = False

    @field_serializer("created_at", "updated_at", "deleted_at")
    def serialize_dt(self, value: datetime | None, _info):
        return _iso(value)


class Breadcrumb(BaseModel):
    id: str | None
    name: str


class NodeList(BaseModel):
    items: list[NodeOut]
    breadcrumb: list[Breadcrumb]
    total: int


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None


class NodeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None
    is_favorite: bool | None = None


class MoveRequest(BaseModel):
    parent_id: str | None = None


class ShareCreate(BaseModel):
    node_id: str
    password: str | None = Field(default=None, min_length=4, max_length=128)
    expires_in_hours: int | None = Field(default=None, ge=1, le=24 * 365)
    allow_download: bool = True


class ShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    token: str
    node_id: str
    allow_download: bool
    download_count: int
    expires_at: datetime | None
    created_at: datetime
    has_password: bool = False
    url: str = ""
    node_name: str = ""
    node_kind: str = "file"
    node_size: int = 0
    node_mime: str = ""

    @field_serializer("expires_at", "created_at")
    def serialize_dt(self, value: datetime | None, _info):
        return _iso(value)


class ShareInfo(BaseModel):
    token: str
    name: str
    kind: str
    size: int
    mime_type: str
    owner: str
    created_at: datetime
    expires_at: datetime | None
    allow_download: bool
    requires_password: bool
    download_count: int

    @field_serializer("created_at", "expires_at")
    def serialize_dt(self, value: datetime | None, _info):
        return _iso(value)


class ShareUnlock(BaseModel):
    password: str


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    action: str
    node_id: str | None
    node_name: str
    size: int
    created_at: datetime

    @field_serializer("created_at")
    def serialize_dt(self, value: datetime | None, _info):
        return _iso(value)


class TypeUsage(BaseModel):
    label: str
    size: int
    count: int


class StatsOut(BaseModel):
    used: int
    quota: int
    files: int
    folders: int
    trash_size: int
    trash_count: int
    favorites: int
    shared: int
    by_type: list[TypeUsage]
    activity: list[ActivityOut]

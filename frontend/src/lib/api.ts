export type User = {
  id: string;
  email: string;
  display_name: string;
  color: string;
  quota_bytes: number;
  created_at: string;
  last_login_at: string | null;
};

export type NodeItem = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "file" | "folder";
  size: number;
  mime_type: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  has_share: boolean;
};

export type Breadcrumb = { id: string | null; name: string };

export type NodeList = { items: NodeItem[]; breadcrumb: Breadcrumb[]; total: number };

export type Share = {
  id: string;
  token: string;
  node_id: string;
  allow_download: boolean;
  download_count: number;
  expires_at: string | null;
  created_at: string;
  has_password: boolean;
  url: string;
  node_name: string;
  node_kind: string;
  node_size: number;
  node_mime: string;
};

export type ShareInfo = {
  token: string;
  name: string;
  kind: string;
  size: number;
  mime_type: string;
  owner: string;
  created_at: string;
  expires_at: string | null;
  allow_download: boolean;
  requires_password: boolean;
  download_count: number;
};

export type Activity = {
  id: string;
  action: string;
  node_id: string | null;
  node_name: string;
  size: number;
  created_at: string;
};

export type Stats = {
  used: number;
  quota: number;
  files: number;
  folders: number;
  trash_size: number;
  trash_count: number;
  favorites: number;
  shared: number;
  by_type: { label: string; size: number; count: number }[];
  activity: Activity[];
};

export type AuthConfig = {
  app_name: string;
  channel: "email" | "telegram" | "console";
  dev_mode: boolean;
  otp_length: number;
  resend_after: number;
  max_upload_bytes: number;
  storage_backend: string;
};

export type OtpRequestResult = {
  message: string;
  channel: string;
  expires_in: number;
  resend_after: number;
  dev_code: string | null;
  is_new_user: boolean;
};

export type AuthResult = { access_token: string; token_type: string; user: User; is_new_user: boolean };

const TOKEN_KEY = "nube.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    mediaCache = null;
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const detail =
      (payload && (typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail))) ||
      `Error ${response.status}`;
    if (response.status === 401 && !path.includes("/api/auth/otp") && !path.includes("/api/public")) {
      tokenStore.clear();
    }
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
};

export const api = {
  config: () => request<AuthConfig>("/api/auth/config"),
  requestOtp: (email: string) =>
    request<OtpRequestResult>("/api/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string) =>
    request<AuthResult>("/api/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code }) }),
  me: () => request<User>("/api/auth/me"),
  updateMe: (display_name: string) =>
    request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ display_name }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  deleteAccount: () => request<{ ok: boolean }>("/api/auth/me", { method: "DELETE" }),

  listNodes: (params: {
    parent_id?: string | null;
    search?: string;
    kind?: string;
    favorites?: boolean;
    trashed?: boolean;
    recent?: boolean;
    sort?: string;
  }) => request<NodeList>(`/api/nodes${qs(params)}`),
  createFolder: (name: string, parent_id: string | null) =>
    request<NodeItem>("/api/nodes/folder", { method: "POST", body: JSON.stringify({ name, parent_id }) }),
  updateNode: (id: string, body: { name?: string; is_favorite?: boolean; parent_id?: string | null }) =>
    request<NodeItem>(`/api/nodes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  trashNode: (id: string) => request<{ ok: boolean }>(`/api/nodes/${id}`, { method: "DELETE" }),
  restoreNode: (id: string) => request<NodeItem>(`/api/nodes/${id}/restore`, { method: "POST" }),
  purgeNode: (id: string) => request<{ ok: boolean }>(`/api/nodes/${id}/permanent`, { method: "DELETE" }),
  emptyTrash: () => request<{ ok: boolean; removed: number }>("/api/trash/empty", { method: "POST" }),
  stats: () => request<Stats>("/api/stats"),
  activity: () => request<Activity[]>("/api/activity?limit=30"),

  createShare: (body: {
    node_id: string;
    password?: string | null;
    expires_in_hours?: number | null;
    allow_download?: boolean;
  }) => request<Share>("/api/shares", { method: "POST", body: JSON.stringify(body) }),
  listShares: () => request<Share[]>("/api/shares"),
  deleteShare: (id: string) => request<{ ok: boolean }>(`/api/shares/${id}`, { method: "DELETE" }),

  shareInfo: (token: string) => request<ShareInfo>(`/api/public/shares/${token}`),
  unlockShare: (token: string, password: string) =>
    request<{ access: string }>(`/api/public/shares/${token}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  shareItems: (token: string, access?: string) =>
    request<NodeItem[]>(`/api/public/shares/${token}/items${qs({ access })}`),
};

let mediaCache: { token: string; expires: number } | null = null;

export async function getMediaToken(force = false): Promise<string> {
  if (!force && mediaCache && mediaCache.expires > Date.now() + 30_000) return mediaCache.token;
  const result = await request<{ token: string; expires_in: number }>("/api/auth/media-token", { method: "POST" });
  mediaCache = { token: result.token, expires: Date.now() + result.expires_in * 1000 };
  return result.token;
}

export async function rawUrl(id: string): Promise<string> {
  return `/api/nodes/${id}/raw?t=${await getMediaToken()}`;
}

export async function downloadUrl(id: string): Promise<string> {
  return `/api/nodes/${id}/download?t=${await getMediaToken()}`;
}

export const shareDownloadUrl = (token: string, access?: string, nodeId?: string) =>
  `/api/public/shares/${token}/download${qs({ access, node_id: nodeId })}`;
export const shareRawUrl = (token: string, access?: string) =>
  `/api/public/shares/${token}/raw${qs({ access })}`;

export function uploadFile(
  file: File,
  parentId: string | null,
  relativePath: string | undefined,
  onProgress: (percent: number) => void,
): Promise<NodeItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (parentId) form.append("parent_id", parentId);
    if (relativePath) form.append("relative_path", relativePath);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/nodes/upload");
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let message = `Error ${xhr.status}`;
        try {
          message = JSON.parse(xhr.responseText).detail ?? message;
        } catch {
          /* ignore */
        }
        if (xhr.status === 401) tokenStore.clear();
        reject(new ApiError(message, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Error de red durante la subida", 0));
    xhr.send(form);
  });
}

export async function fetchBlobAuthorized(url: string): Promise<Blob> {
  const token = tokenStore.get();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError("No se pudo cargar el contenido", response.status);
  return response.blob();
}

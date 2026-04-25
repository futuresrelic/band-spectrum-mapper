const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

// Auth token injected by AuthContext on login/restore
let _token: string | null = null;
export function setAuthToken(t: string | null) { _token = t; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const baseHeaders: Record<string, string> = isForm ? {} : { 'Content-Type': 'application/json' };
  if (_token) baseHeaders['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...baseHeaders, ...(init?.headers as Record<string, string> | undefined ?? {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:      <T>(path: string)                   => request<T>(path),
  post:     <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch:    <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:      <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  delete:   <T>(path: string)                   => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: FormData)    => request<T>(path, { method: 'POST',  body: form }),
};

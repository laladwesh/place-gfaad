const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000").replace(
  /\/$/, ""
);

export async function backendRequest<T>(
  endpoint: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${backendUrl}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Backend error ${response.status}: ${errorBody}`);
  }

  return (await response.json()) as T;
}

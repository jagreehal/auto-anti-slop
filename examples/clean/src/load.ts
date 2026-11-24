/** A subclass can't narrow the fields its base declares, so its public state is its own choice. */
export class RequestError extends Error {
  override name = 'RequestError';

  constructor(
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(`Request failed with status ${String(status)}`, options);
  }
}

async function loadText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new RequestError(response.status);
  }

  return response.text();
}

export async function loadAll(urls: ReadonlyArray<string>): Promise<Map<string, string>> {
  const entries = await Promise.all(
    urls.map(async (url): Promise<[string, string]> => [url, await loadText(url)]),
  );

  return new Map(entries);
}

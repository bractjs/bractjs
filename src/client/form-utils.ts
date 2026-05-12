/**
 * Fetches fresh loader data for a pathname and updates the router context.
 */
export async function reloadLoaders(
  pathname: string,
  setLoaderData: (data: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(`/_data?path=${encodeURIComponent(pathname)}`);
  if (!res.ok) return;
  const data = (await res.json()) as Record<string, unknown>;
  setLoaderData(data);
}

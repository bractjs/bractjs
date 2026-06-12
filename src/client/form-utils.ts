/**
 * Fetches fresh loader data for a pathname and updates the router context.
 *
 * @deprecated `<Form>` now revalidates through the router (see
 * `useRevalidator`); kept only for callers that imported this directly.
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

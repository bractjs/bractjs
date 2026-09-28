// Identical workload for every framework: 100 deterministic rows, as if read
// from a database. Each app holds a verbatim copy; run.ts refuses to run if
// any copy has drifted from this file.
export interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
}

export const products: Product[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  price: Math.round(((i * 7919) % 10_000) + 99) / 100,
  description: `A dependable item number ${i + 1}, described in about eighty characters of plain text.`,
}));

export async function listProducts(): Promise<Product[]> {
  return products;
}

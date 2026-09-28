import { Counter } from "./counter";
import { listProducts } from "./data";

// Render per request, like the loader-driven pages in the other apps (Next
// would otherwise prerender this page once at build time).
export const dynamic = "force-dynamic";

export default async function Products() {
  const products = await listProducts();
  return (
    <main>
      <h1>Products</h1>
      <Counter />
      <table>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>${p.price.toFixed(2)}</td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

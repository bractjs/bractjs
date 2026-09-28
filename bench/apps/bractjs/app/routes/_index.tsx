import { useLoaderData } from "@bractjs/bractjs";
import { Counter } from "../counter.tsx";
import { listProducts } from "../data.ts";

export async function loader() {
  return { products: await listProducts() };
}

export default function Products() {
  const { products } = useLoaderData<typeof loader>();
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

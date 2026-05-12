import type { ActionArgs } from "../../../../shared/route-types.ts";

// Loader returns data that will appear in __BRACTJS_DATA__
export function loader() {
  return { message: "hello from bractjs" };
}

// Meta returns a title descriptor
export function meta() {
  return [{ title: "BractJS Test Home" }];
}

// Action echoes the submitted form field
export async function action({ formData }: ActionArgs) {
  return { submitted: true, name: formData.get("name") };
}

export default function IndexPage() {
  return <p>Index page content</p>;
}

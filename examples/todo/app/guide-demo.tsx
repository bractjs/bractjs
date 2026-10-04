import { useState } from "react";

// An interactive component inside the MDX guide: it only counts once the page
// has hydrated.
export function ClickCounter() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setCount((n) => n + 1)}
      className="mb-4 rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-teal-ink hover:bg-teal/90"
    >
      Clicked {count} {count === 1 ? "time" : "times"}
    </button>
  );
}

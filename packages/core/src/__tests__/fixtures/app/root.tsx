// Minimal root component for integration tests. Renders the matched route
// through <Outlet/> so body-level SSR assertions (components, Fallbacks) work.
import { Outlet } from "../../../client/components/Outlet.tsx";

export default function Root() {
  return (
    <html>
      <head></head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}

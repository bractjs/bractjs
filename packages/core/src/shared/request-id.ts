import { createContext, useContext } from "react";

// The id the requestId() middleware gave the request that rendered this page
// (or loaded its data, after a client navigation). The server puts it in the
// document and every /_data payload, so server and client render the same id.
export const RequestIdContext = createContext<string | undefined>(undefined);

/**
 * The current page's request id, from the `requestId()` middleware — show it
 * on error pages so users can quote it to support. Undefined when the
 * middleware isn't registered.
 */
export function useRequestId(): string | undefined {
  return useContext(RequestIdContext);
}

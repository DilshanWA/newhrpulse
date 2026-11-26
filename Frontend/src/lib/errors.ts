/** App-wide error reporting: AppShell listens and shows a dismissible banner. */
export const ERROR_EVENT = "hrp:error";

export function messageOf(e: unknown, fallback = "Something went wrong") {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

export function reportError(e: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<unknown>(ERROR_EVENT, { detail: e }));
}

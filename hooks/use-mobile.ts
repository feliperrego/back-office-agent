import * as React from "react"

// Added by the shadcn CLI with the sidebar. Rewritten with useSyncExternalStore, because the
// generated version called setState inside an effect, which the repo's React lint rejects
// (react-hooks/set-state-in-effect); the behaviour is the same, false on the server and before
// hydration (template spec §5.12).
const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}

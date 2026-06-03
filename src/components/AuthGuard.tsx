import { Navigate, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../store";

/** Wraps protected routes. Redirects to /login if not authenticated. */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const authed = useIsAuthenticated();
  const loc = useLocation();
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}

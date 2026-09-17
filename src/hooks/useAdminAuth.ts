import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/**
 * Hook to protect admin routes using server-side roles.
 * Redirects to /login if the user is not an admin.
 */
export function useAdminAuth() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/login");
    }
  }, [isAdmin, loading, navigate]);

  return { isAdmin, loading };
}

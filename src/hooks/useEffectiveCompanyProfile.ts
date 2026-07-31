import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  CompanyBranding,
  getEffectiveCompanyProfile,
  isMember,
} from "@/lib/account";

/**
 * Resolves the branding fields to render for the current user.
 *
 * For member seats this asynchronously looks up the owner's branding; for
 * owners/standalone users it returns their own. `readOnly` is true for members
 * (branding is inherited, not editable).
 */
export const useEffectiveCompanyProfile = () => {
  const { profile } = useAuth();
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getEffectiveCompanyProfile(profile)
      .then((resolved) => {
        if (!cancelled) {
          setBranding(resolved);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  return {
    branding,
    loading,
    readOnly: isMember(profile),
  };
};

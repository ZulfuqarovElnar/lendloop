"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type UserState = { isLoading: boolean; isAuthenticated: boolean };
const UserContext = createContext<UserState>({ isLoading: true, isAuthenticated: false });

/**
 * Signed in *and* known to Convex. Pages that call user-only queries wait for this: right after
 * sign-in the Clerk session exists before Convex has accepted the token and stored the user row,
 * and a query sent in that gap would be rejected.
 */
export const useCurrentUser = () => useContext(UserContext);

function UserProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
      setUserId(null);
    };
  }, [isAuthenticated, store]);

  const value = {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <UserProvider>{children}</UserProvider>
    </ConvexProviderWithClerk>
  );
}

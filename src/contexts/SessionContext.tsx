import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AuthState = { session: Session | null; loading: boolean; recovery: boolean; error: string | null; clearError: () => void };
const SessionContext = createContext<AuthState>({ session: null, loading: true, recovery: false, error: null, clearError: () => {} });
export function authError(error: unknown): string { return error instanceof AuthApiError ? error.message : error instanceof Error ? error.message : 'Unable to complete authentication.'; }
export function SessionContextProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next); setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { setRecovery(false); setError(null); }
    });
    supabase.auth.getSession().then(({ data, error }) => { if (error) setError(authError(error)); setSession(data.session); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  return <SessionContext.Provider value={{ session, loading, recovery, error, clearError: () => setError(null) }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);

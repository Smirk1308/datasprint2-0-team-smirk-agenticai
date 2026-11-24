import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSession, authError } from '@/contexts/SessionContext';

export default function AuthCallback() {
  const { recovery } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    async function complete() {
      const url = new URL(window.location.href);
      if (url.searchParams.get('error_description')) { setError(url.searchParams.get('error_description')!); return; }
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && alive) { setError(authError(error)); return; }
      }
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setError(authError(error));
      else if (data.session) navigate(recovery || url.hash.includes('type=recovery') ? '/reset-password' : '/', { replace: true });
      else setError('The sign-in link is invalid or expired. Please request a new one.');
    }
    complete(); return () => { alive = false; };
  }, [navigate, recovery]);
  return <div className="flex min-h-screen items-center justify-center p-6"><div className="rounded-2xl border bg-white p-8 text-center"><h1 className="text-xl font-semibold">{error ? 'Unable to sign in' : 'Completing secure sign-in…'}</h1>{error && <><p role="alert" className="mt-4 max-w-sm text-sm text-destructive">{error}</p><Link to="/login" className="mt-6 block text-primary">Return to sign in</Link></>}</div></div>;
}

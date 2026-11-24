import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSession, authError } from '@/contexts/SessionContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResetPassword() {
  const { session, loading } = useSession(); const navigate = useNavigate();
  const [ready, setReady] = useState(false); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const code = new URL(window.location.href).searchParams.get('code'); if (code) supabase.auth.exchangeCodeForSession(code).then(({error}) => { if(error) setError(authError(error)); setReady(true); }); else setReady(true); }, []);
  async function submit(e: React.FormEvent) { e.preventDefault(); if(password !== confirm) {setError('Passwords do not match.'); return;} setBusy(true); const {error} = await supabase.auth.updateUser({password}); if(error) setError(authError(error)); else {await supabase.auth.signOut(); navigate('/login', {replace:true});} setBusy(false); }
  return <div className="flex min-h-screen items-center justify-center p-6"><div className="w-full max-w-md rounded-3xl border bg-white p-8"><h1 className="font-display text-2xl font-semibold">Choose a new password</h1><p className="mb-6 mt-3 text-sm text-muted-foreground">Use at least 8 characters. You’ll sign in again after updating.</p>{(!ready || loading) ? <p>Checking recovery link…</p> : session ? <form className="space-y-4" onSubmit={submit}><label className="block text-sm">New password<Input className="mt-2 rounded-xl" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><label className="block text-sm">Confirm password<Input className="mt-2 rounded-xl" type="password" minLength={8} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button disabled={busy} className="w-full rounded-xl">Update password</Button></form> : <p className="text-sm">Open the recovery link from your email, or <Link to="/login?view=reset" className="text-primary underline">request a new link</Link>.</p>}{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}</div></div>;
}

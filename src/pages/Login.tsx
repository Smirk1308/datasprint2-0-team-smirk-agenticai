import { useEffect, useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSession, authError } from '@/contexts/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const { session, loading, recovery, error } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = params.get('view') === 'reset';
  useEffect(() => { if (!loading && session) navigate(recovery ? '/reset-password' : '/', { replace: true }); }, [session, loading, recovery, navigate]);
  async function resetPassword(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL('/reset-password', window.location.origin).href });
    setMessage(error ? authError(error) : 'Check your email for a secure password reset link.'); setBusy(false);
  }
  return <div className="grid min-h-screen lg:grid-cols-2">
    <div className="relative hidden flex-col justify-between bg-primary px-16 py-12 text-white lg:flex">
      <Link to="/" className="flex items-center gap-3 text-xl font-semibold"><BookOpenCheck size={30} /> Procurement Desk<span className="rounded-md bg-white/15 px-2 py-1 text-xs">2.0</span></Link>
      <div><p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-teal-100">A clearer way to negotiate</p><h1 className="font-display text-5xl leading-tight">Good decisions.<br />No guesswork.</h1><p className="mt-6 max-w-sm leading-relaxed text-teal-50">One playbook. A transparent decision for every offer. A shared workspace for your procurement team.</p><div className="mt-10 flex gap-6 text-sm text-teal-50"><span className="flex items-center gap-2"><ShieldCheck size={17}/> Policy-first evaluation</span><span className="flex items-center gap-2"><Users size={17}/> Private team history</span></div></div>
      <p className="text-sm text-teal-100">Built for Acme. Designed for clarity.</p>
    </div>
    <div className="flex flex-col bg-background p-6 sm:p-12"><Link to="/" className="flex w-fit items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/> Back to workbench</Link><div className="m-auto w-full max-w-sm py-12"><div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BookOpenCheck size={25}/></div><h2 className="font-display text-3xl font-semibold">{reset ? 'Reset your password' : 'Welcome to your desk'}</h2><p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">{reset ? 'We’ll email you a secure link.' : 'Sign in or create an account to save evaluations and collaborate with your team.'}</p>{error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {reset ? <form onSubmit={resetPassword} className="space-y-4"><label className="block text-sm font-medium">Work email<Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 rounded-xl bg-white"/></label><Button disabled={busy} className="h-11 w-full rounded-xl">Send reset link</Button>{message && <p role="status" className="text-sm">{message}</p>}<Link to="/login" className="block text-center text-sm text-primary">Back to sign in</Link></form> : <><Auth supabaseClient={supabase} providers={[]} redirectTo={new URL('/auth/callback', window.location.origin).href} theme="light" appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: '#0F766E', brandAccent: '#115E59', inputBackground: '#FFFFFF', inputBorder: '#DDE5DF', inputText: '#253D37' }, radii: { borderRadiusButton: '12px', inputBorderRadius: '12px' }, fonts: { bodyFontFamily: 'inherit', buttonFontFamily: 'inherit', inputFontFamily: 'inherit' } } } }}/><Link to="/login?view=reset" className="mt-4 block text-center text-sm text-primary">Request a password reset link</Link></>}
      <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">Your data stays inside your authorized workspace.<br/>No third-party sign-in providers.</p></div></div>
  </div>;
}

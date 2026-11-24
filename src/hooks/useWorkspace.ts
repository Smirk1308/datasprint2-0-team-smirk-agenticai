import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/contexts/SessionContext';
import type { Run, Playbook, Result, Verification } from '@/lib/procurement/types';

type Workspace = { id: string; name: string; owner_id: string };
export function useWorkspace() {
  const { session } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const current = useRef({user:session?.user.id,workspace:workspaceId});
  current.current = {user:session?.user.id,workspace:workspaceId};
  const loadWorkspaces = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.from('procurement_workspaces').select('id,name,owner_id').order('created_at');
    if (current.current.user !== session.user.id) return;
    if (error) throw error;
    setWorkspaces(data ?? []);
    setWorkspaceId(old => data?.some(w => w.id === old) ? old : data?.[0]?.id ?? '');
  }, [session?.user.id]);
  const loadRuns = useCallback(async () => {
    if (!session || !workspaceId) { setRuns([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('procurement_runs').select('id,name,workspace_id,created_by,created_at,policy_version,results,verification').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(30);
    if (current.current.user !== session.user.id || current.current.workspace !== workspaceId) return;
    if (error) setError(error.message); else { setRuns((data ?? []) as Run[]); setError(''); }
    setLoading(false);
  }, [session?.user.id, workspaceId]);
  useEffect(() => { if (!session) {setWorkspaces([]);setWorkspaceId('');setRuns([]);setError('');return;} loadWorkspaces().catch(e=>setError(e.message)); }, [loadWorkspaces, session?.user.id]);
  useEffect(() => { setRuns([]); loadRuns(); }, [loadRuns]);
  async function create(name: string) { const {data,error} = await supabase.rpc('procurement_create_workspace', {workspace_name:name}); if(error) throw error; await loadWorkspaces(); setWorkspaceId(data); }
  async function join(code: string) { if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code.trim())) throw new Error('Enter a valid workspace invitation code.'); const {data,error} = await supabase.rpc('procurement_join_workspace', {invite_code:code.trim()}); if(error) throw error; await loadWorkspaces(); setWorkspaceId(data); }
  async function save(name: string, results: Result[], verification: Verification | null, book: Playbook) {
    if (!session || !workspaceId) throw new Error('Sign in and select a workspace before saving.');
    if (!results.length) throw new Error('Evaluate a batch before saving.');
    const {error} = await supabase.from('procurement_runs').insert({workspace_id:workspaceId,created_by:session.user.id,name,results,verification,policy_version:book.version,policy_snapshot:book});
    if(error) throw error; await loadRuns();
  }
  async function remove(id: string) { const {error} = await supabase.from('procurement_runs').delete().eq('id',id).eq('created_by',session!.user.id); if(error) throw error; await loadRuns(); }
  return {workspaces,workspaceId,setWorkspaceId,workspace:workspaces.find(w=>w.id===workspaceId),runs,loading,error,create,join,save,remove,refresh:loadRuns};
}

import { useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud, CheckCircle2, ArrowRight, AlertCircle, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { parseThreads, parseAnswers, verifyResults } from '@/lib/procurement/files';
import { evaluate } from '@/lib/procurement/engine';
import type { Playbook, Result, Verification } from '@/lib/procurement/types';

export default function BatchDialog({open,onOpenChange,book,onComplete}:{open:boolean;onOpenChange:(v:boolean)=>void;book:Playbook;onComplete:(results:Result[], name:string, verification:Verification|null)=>void}) {
  const input = useRef<HTMLInputElement>(null);
  const [file,setFile] = useState<File|null>(null); const [answers,setAnswers] = useState<File|null>(null);
  const [name,setName] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false); const [progress,setProgress] = useState(0);
  function select(f:File|undefined) { if(!f) return; if(!f.name.toLowerCase().endsWith('.csv') || f.size>20*1024*1024) {setError('Use a CSV file under 20 MB.');return;} setFile(f);setName(f.name.replace(/\.csv$/i,''));setError(''); }
  async function run() {
    if(!file)return;setBusy(true);setError('');setProgress(0);
    try {
      const rows = parseThreads(await file.text(),book);
      const expected = answers ? parseAnswers(await answers.text()) : null;
      const results:Result[]=[];
      for(let i=0;i<rows.length;i+=100) {
        results.push(...rows.slice(i,i+100).map(row=>evaluate(row,book)));
        setProgress(Math.round(results.length/rows.length*100));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const verification=expected?verifyResults(results,expected):null;
      onComplete(results,name.trim()||file.name,verification);onOpenChange(false);setFile(null);setAnswers(null);setName('');
    } catch(e) {setError(e instanceof Error?e.message:'Unable to process this batch.');}
    finally {setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl p-7 [&>button]:rounded-full"><DialogHeader><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSpreadsheet size={25}/></div><DialogTitle className="font-display text-2xl">Start a new evaluation</DialogTitle><DialogDescription className="leading-relaxed">Upload negotiation threads. We’ll validate the data, apply the playbook, and prepare your submission.</DialogDescription></DialogHeader>
    <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={e=>select(e.target.files?.[0])}/>
    <button disabled={busy} onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)select(e.dataTransfer.files[0]);}} className="mt-3 flex min-h-40 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/25 bg-primary/[.035] p-6 transition hover:border-primary/60"><UploadCloud size={28} className="mb-3 text-primary"/><span className="text-sm font-semibold">{file?file.name:'Drop your threads.csv here'}</span><span className="mt-2 text-xs text-muted-foreground">{file?`${(file.size/1024).toFixed(1)} KB · click to replace`:'or click to browse · CSV up to 20 MB'}</span></button>
    <label className="text-sm font-medium">Evaluation name<Input className="mt-2 h-11 rounded-xl" maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="e.g. November supplier negotiations"/></label>
    <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Ground-truth answers <span className="font-normal text-muted-foreground">· optional</span></p><p className="mt-1 text-xs text-muted-foreground">Validate exact labels against sample_answers.csv.</p></div>{answers?<button disabled={busy} onClick={()=>setAnswers(null)} aria-label="Remove expected answers"><X size={17}/></button>:null}</div><input disabled={busy} type="file" accept=".csv" aria-label="Ground-truth answers CSV" onChange={e=>setAnswers(e.target.files?.[0]??null)} className="mt-3 w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:text-primary"/></div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 size={15} className="text-primary"/> Policy: {book.version}</div>
    {error&&<p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle size={18} className="shrink-0"/>{error}</p>}
    {busy&&<div aria-live="polite"><div className="mb-2 flex justify-between text-xs"><span>Validating & evaluating…</span><span>{progress}%</span></div><Progress value={progress} className="h-2 rounded-full"/></div>}
    <Button disabled={!file||busy} onClick={run} className="mt-1 h-12 rounded-xl">{busy?<Loader2 size={17} className="mr-2 animate-spin"/>:<ArrowRight size={17} className="mr-2"/>}{busy?'Processing batch…':'Validate & evaluate'}</Button><p className="text-center text-xs text-muted-foreground">Files are processed in your browser. Save explicitly to share with your team.</p>
  </DialogContent></Dialog>;
}

import { CheckCircle2, FlaskConical, Download, AlertTriangle, ShieldCheck, FileCheck2, TestTube2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Verification } from '@/lib/procurement/types';
import { downloadText } from '@/lib/procurement/files';
import { runRuleChecks, runDataChecks } from '@/lib/procurement/regression';

const rules = runRuleChecks(), data = runDataChecks();
const defaultChecks:Verification = {total:rules.total+data.total,matched:rules.matched+data.matched,mismatches:[...rules.mismatches,...data.mismatches]};
type Props = {sample:Verification|null;historical:Verification|null;current:Verification|null;checks?:Verification};
export default function ReportsView({sample,historical,current,checks=defaultChecks}:Props) {
  const cards = [
    {title:'Sample ground-truth regression',report:sample,detail:'Engine outputs compared against the attached sample labels. Answers are never used to make decisions.',icon:FlaskConical},
    {title:'Historical counter consistency',report:historical,detail:'Recompute L(r − 1) and compare with our_last_counter. This tests the schedule, not all final decisions.',icon:ShieldCheck},
    {title:'Rule & file boundary tests',report:checks,detail:'Independent fixtures check rule precedence, normalization, rounding, CSV safety, and policy completeness.',icon:TestTube2},
    {title:'Current batch validation',report:current,detail:'Exact thread-ID and label comparison against the optional answers CSV uploaded with your batch.',icon:FileCheck2},
  ];
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-6 rounded-2xl border bg-white px-6 py-5">
      <div><p className="eyebrow">Evidence, not assumptions</p><h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Verification reports</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Every benchmark comes from an actual comparison. Historical counter agreement does not prove final-decision accuracy.</p></div>
      <img src="/assets/verification-checklist.png" alt="Checklist and magnifying glass illustrating careful verification" className="hidden h-32 w-44 rounded-xl object-cover mix-blend-multiply md:block"/>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({title,report,detail,icon:Icon}) => <div key={title} className="rounded-2xl border bg-white p-5">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={20}/></div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-5 font-display text-2xl font-semibold">{report?`${report.matched.toLocaleString()} / ${report.total.toLocaleString()}`:'Not verified'}</p>
        <div className={`mt-3 flex items-center gap-1.5 text-xs ${report&&report.matched===report.total?'text-primary':'text-amber-800'}`}>
          {report&&report.matched===report.total?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>}
          {report&&report.total?`${(report.matched/report.total*100).toFixed(1)}% exact match`:'No comparison data available'}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        {report&&<Button variant="outline" size="sm" className="mt-5 rounded-lg text-xs" onClick={()=>downloadText(`${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`,JSON.stringify(report,null,2),'application/json')}><Download size={13} className="mr-2"/>Download report</Button>}
      </div>)}
    </div>
    {cards.filter(c=>c.report?.mismatches.length).map(c => <div key={c.title} className="overflow-hidden rounded-2xl border bg-white">
      <h3 className="border-b p-5 text-sm font-semibold">{c.title} · {c.report!.mismatches.length} mismatches</h3>
      <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-secondary"><tr><th className="p-4">Thread / Test</th><th className="p-4">Expected</th><th className="p-4">Actual</th></tr></thead><tbody>
        {c.report!.mismatches.map(m=><tr key={m.id} className="border-t"><td className="p-4 font-mono">{m.id}</td><td className="break-all p-4 font-mono text-muted-foreground">{m.expected}</td><td className="break-all p-4 font-mono text-amber-800">{m.actual}</td></tr>)}
      </tbody></table></div>
    </div>)}
    <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><AlertTriangle size={20} className="shrink-0 text-amber-800"/><p className="text-sm leading-relaxed text-amber-900">The earlier 100% claims are reported benchmarks, not guarantees. This interface shows results computed with the supplied playbook. The full test dataset has no attached final ground truth.</p></div>
  </div>;
}

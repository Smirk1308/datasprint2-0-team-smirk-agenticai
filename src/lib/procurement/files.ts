import Papa from 'papaparse';
import { z } from 'zod';
import type { Thread, Result, Verification, Playbook } from './types';
import { officialPlaybook } from './playbook';

const threadSchema = z.object({ thread_id: z.string().min(1).regex(/^[A-Za-z0-9_][\w.-]*$/, 'Use a safe alphanumeric thread ID'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date'), supplier: z.string().min(1), category: z.string().min(1), quantity: z.coerce.number().positive().int(), round: z.coerce.number().positive().int(), our_last_counter: z.preprocess(v => v === '' || v === null ? null : Number(v), z.number().nonnegative().nullable()), supplier_message: z.string().min(1).max(100000) });
const labelPattern = /^(?:ACCEPT:ACCEPTABLE_PRICE:|COUNTER:COUNTER_OFFER:\d+|REJECT:(?:ABOVE_WALKAWAY|BLACKLISTED_SUPPLIER):|ESCALATE:(?:MISSING_INFO|PROMPT_INJECTION|BANNED_TERM|OVER_APPROVAL_LIMIT):)$/;
export function parseThreads(text: string, book: Playbook): Thread[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.replace(/^\uFEFF/, '').trim() });
  if (parsed.errors.length) throw new Error(`CSV error: ${parsed.errors[0].message}`);
  const headers = parsed.meta.fields ?? [];
  const required = Object.keys(threadSchema.shape);
  if (required.some(h => !headers.includes(h))) throw new Error(`Required headers: ${required.join(', ')}`);
  if (!parsed.data.length || parsed.data.length > 20000) throw new Error('Upload between 1 and 20,000 threads per batch.');
  const seen = new Set<string>();
  return parsed.data.map((raw, i) => {
    const checked = threadSchema.safeParse(raw);
    if (!checked.success) throw new Error(`Row ${i + 2}: ${checked.error.issues[0].path.join('.')} — ${checked.error.issues[0].message}`);
    const row = checked.data as Thread;
    if (seen.has(row.thread_id)) throw new Error(`Duplicate thread ID: ${row.thread_id}`);
    seen.add(row.thread_id);
    const category = book.categories[row.category];
    if (!category) throw new Error(`Missing policy for category ${row.category}. Upload the complete playbook.`);
    if (row.round > category.rounds) throw new Error(`${row.thread_id}: round exceeds category final round (${category.rounds}).`);
    return row;
  });
}
export function parseAnswers(text: string): Record<string, string> {
  const parsed = Papa.parse<{ thread_id: string; label: string }>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.replace(/^\uFEFF/, '').trim() });
  if (parsed.errors.length || !parsed.meta.fields?.includes('thread_id') || !parsed.meta.fields?.includes('label')) throw new Error('Answer CSV must have thread_id,label headers and valid CSV rows.');
  const answers: Record<string, string> = Object.create(null);
  for (const row of parsed.data) {
    if (!row.thread_id || !labelPattern.test(row.label) || answers[row.thread_id]) throw new Error(`Invalid or duplicate answer row: ${row.thread_id}`);
    answers[row.thread_id] = row.label;
  }
  if (!Object.keys(answers).length) throw new Error('Answer file has no labels.');
  return answers;
}
export function verifyResults(results: Result[], answers: Record<string, string>): Verification {
  if (results.length !== Object.keys(answers).length || results.some(r => !(r.thread.thread_id in answers))) throw new Error('Expected labels must match the batch thread IDs exactly.');
  const mismatches = results.filter(r => r.label !== answers[r.thread.thread_id]).map(r => ({ id: r.thread.thread_id, expected: answers[r.thread.thread_id], actual: r.label || `ERROR: ${r.error}` }));
  return { total: results.length, matched: results.length - mismatches.length, mismatches };
}
export function submissionCsv(results: Result[]): string {
  if (!results.length || results.some(r => r.error || !labelPattern.test(r.label))) throw new Error('Export blocked: every row must have a valid, completed decision.');
  return Papa.unparse(results.map(r => ({ thread_id: r.thread.thread_id, label: r.label })), { newline: '\n' }) + '\n';
}
export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const categorySchema = z.object({ unit: z.string().min(1), gst: z.number().min(0).max(100), target: z.number().nonnegative(), walkaway: z.number().nonnegative(), rounds: z.number().int().min(2), beta: z.number().positive(), approval: z.number().positive() }).refine(c => c.walkaway >= c.target, 'Walk-away must be at least target');
const playbookSchema = z.object({ version: z.string().min(1), source: z.string().min(1), categories: z.record(categorySchema), amendments: z.array(z.object({ id: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.string(), field: z.enum(['target', 'walkaway', 'approval']), value: z.number().nonnegative() })), suppliers: z.record(z.object({ status: z.enum(['BLACKLISTED', 'PROBATION']).optional(), caps: z.record(z.number().positive()).optional(), fx: z.record(z.number().positive()).optional() })), fx: z.record(z.number().positive()) });
export function parsePlaybook(text: string): Playbook {
  const book = playbookSchema.parse(JSON.parse(text));
  if (Object.keys(book.categories).length !== 15 || Object.keys(officialPlaybook.categories).some(c => !Object.prototype.hasOwnProperty.call(book.categories,c)) || book.fx.INR !== 1 || ['USD', 'EUR', 'GBP'].some(c => !book.fx[c]) || Object.keys(book.fx).some(c => !['INR', 'USD', 'EUR', 'GBP'].includes(c))) throw new Error('The Acme playbook needs all 15 named categories and the approved INR/USD/EUR/GBP exchange table.');
  for (const a of book.amendments) {
    if (!Object.prototype.hasOwnProperty.call(book.categories,a.category)) throw new Error(`Unknown amendment category ${a.category}`);
    if (Number.isNaN(Date.parse(a.date)) || new Date(a.date).toISOString().slice(0,10)!==a.date) throw new Error(`Invalid amendment date ${a.date}`);
  }
  for (const supplier of Object.values(book.suppliers)) for (const c of Object.keys(supplier.caps ?? {})) if (!Object.prototype.hasOwnProperty.call(book.categories,c)) throw new Error(`Unknown contract category ${c}`);
  return book as Playbook;
}

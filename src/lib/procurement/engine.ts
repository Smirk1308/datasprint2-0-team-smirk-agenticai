import type { Thread, Playbook, Result, AuditStep } from './types';

const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export function numberWords(text: string): number {
  let total = 0, group = 0;
  for (const word of text.toLowerCase().replace(/-/g, ' ').split(/\s+/)) {
    if (word in words) group += words[word];
    else if (word === 'hundred') group *= 100;
    else if (['thousand', 'lakh', 'lakhs', 'crore'].includes(word)) {
      const scale = word === 'thousand' ? 1000 : word === 'crore' ? 10000000 : 100000;
      total += group * scale; group = 0;
    }
  }
  return total + group;
}
export function latestMessage(text: string): string {
  const markers = [...text.matchAll(/\[Latest message[^\]]*\]/gi)];
  return markers.length ? text.slice(markers[markers.length - 1].index! + markers[markers.length - 1][0].length) : text;
}
function earlierSupplier(text: string, supplier: string): string | null {
  const chunks = [...text.matchAll(/\[(Earlier|Latest) message[^\]]*\]([\s\S]*?)(?=\[(?:Earlier|Latest) message|$)/gi)];
  const own = chunks.filter(m => m[1].toLowerCase() === 'earlier' && m[0].slice(0, m[0].indexOf(']')).includes(supplier));
  return own.length ? own[own.length - 1][2] : null;
}
function amounts(text: string): { value: number; currency: string; index: number; end: number }[] {
  const found = [...text.matchAll(/(₹|Rs\.?|INR|USD|EUR|GBP|AED|JPY|SGD|[A-Z]{3})\s*([\d,]+(?:\.\d+)?)\s*(lakh\b|lakhs\b|crore\b|k\b)?/g)].map(m => ({
    value: Number(m[2].replace(/,/g, '')) * (m[3] ? (/^k$/i.test(m[3]) ? 1000 : /crore/i.test(m[3]) ? 10000000 : 100000) : 1),
    currency: /₹|Rs\.?|INR/.test(m[1]) ? 'INR' : m[1], index: m.index!, end: m.index! + m[0].length,
  }));
  const wordPattern = new RegExp(`\\b((?:(?:${Object.keys(words).join('|')}|hundred|thousand|lakh|lakhs|crore|and)[ -]+)+)rupees\\b`, 'gi');
  for (const m of text.matchAll(wordPattern)) found.push({ value: numberWords(m[1]), currency: 'INR', index: m.index!, end: m.index! + m[0].length });
  if (!found.length) {
    const m = text.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:rupees\s*)?(?:per\s+(?:meal|site|server|shipment|seat|headset|laptop|fixture|phone|monitor|chair|box|guard|participant|ream)|\/(?:month|year))/i);
    if (m) found.push({ value: Number(m[1].replace(/,/g, '')), currency: 'INR', index: m.index!, end: m.index! + m[0].length });
  }
  return found.sort((a, b) => a.index - b.index);
}
export function injectionEvidence(text: string): string | null {
  const pattern = /\[admin override\][^\n]*|ignore (?:all )?(?:your )?(?:previous|prior) instructions[^\n]*|(?:note for the language model|system note to ai agent|<!--\s*assistant:)[^\n]*|(?:whichever bot|if an automated system|AI सहायक)[^\n]*|(?:pre-approved|approval (?:was )?already granted)[^\n]*|(?:ai|bot|model|automated system|reviewer)\s*[:,][^\n]*(?:accept|approve|skip|override)|(?:as per Acme Procurement Policy)[^\n]*pre-approved/gi;
  const match = pattern.exec(text);
  return match?.[0] ?? null;
}
export function bannedEvidence(text: string): string | null {
  for (const clause of text.split(/[\n;]|\.(?:\s+|$)/)) {
    if (/auto[- ]?renew|automatic renewal|continues (?:from )?year to year|renews on its own|renew(?:s|al)? automatically/i.test(clause) && !/no (?:automatic\s+|auto[- ]?)renewal|does not auto[- ]?renew|will not (?:automatically )?renew|renewal only (?:by mutual agreement|if both parties sign again)/i.test(clause)) return clause.trim();
    if (/unlimited/.test(clause.toLowerCase()) && /acme.{0,50}liability|liability.{0,50}acme/i.test(clause) && !/not unlimited|no unlimited liability/i.test(clause)) return clause.trim();
    if (/exclusive supplier|exclusivity|sole supplier|only from (?:us|this supplier)|buy (?:these items |everything )?(?:exclusively|only) from/i.test(clause) && !/not asking for exclusivity|no exclusivity|non-exclusive|not.{0,15}exclusive/i.test(clause)) return clause.trim();
    if (/upfront|advance/i.test(clause)) {
      for (const m of clause.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) if (Number(m[1]) > 30) return clause.trim();
      const m = clause.match(/([a-z -]+)\s+(?:percent|per cent)/i);
      if (/half (?:the )?order value|half.{0,30}(?:upfront|advance)/i.test(clause) || (m && numberWords(m[1]) > 30)) return clause.trim();
    }
  }
  return null;
}
export function effectivePolicy(thread: Thread, book: Playbook) {
  const base = book.categories[thread.category];
  if (!base) throw new Error(`No category policy for ${thread.category}`);
  const category = { ...base };
  const applied = book.amendments.filter(a => a.category === thread.category && a.date <= thread.date).sort((a, b) => a.date.localeCompare(b.date));
  for (const amendment of applied) category[amendment.field] = amendment.value;
  const supplier = book.suppliers[thread.supplier] ?? {};
  const cap = supplier.caps?.[thread.category];
  if (cap !== undefined) category.walkaway = cap;
  const ratio = Math.min(1, Math.max(0, (thread.round - 1) / (category.rounds - 1)));
  const limit = supplier.status === 'PROBATION' ? category.target : category.target + (category.walkaway - category.target) * ratio ** category.beta;
  return { category, supplier, applied, cap, limit };
}
function normalize(text: string, thread: Thread, book: Playbook, previous: string | null, notes: string[]): { price: number | null; missing: string | null } {
  const { category, supplier } = effectivePolicy(thread, book);
  const discountPrevious = text.match(/(\d+(?:\.\d+)?)\s*%\s*off (?:our |the )?previous quote/i);
  if (discountPrevious) {
    if (!previous) return { price: null, missing: 'Previous supplier quote is unavailable.' };
    const prior = normalize(previous, thread, book, null, notes);
    if (prior.missing) return prior;
    notes.push(`Previous supplier offer × ${1 - Number(discountPrevious[1]) / 100} (${discountPrevious[1]}% reduction).`);
    return { price: prior.price! * (1 - Number(discountPrevious[1]) / 100), missing: null };
  }
  const quotes = amounts(text);
  if (!quotes.length) return { price: null, missing: 'No usable quoted price in the latest supplier message.' };
  let selected = quotes[0];
  const correction = text.match(/should read/i);
  if (correction) { selected = quotes.find(q => q.index >= correction.index!) ?? selected; notes.push('Correction replaces the earlier price.'); }
  else if (/between|price range|ranges? from/i.test(text) && quotes.length >= 2) { selected = quotes.slice(0, 2).reduce((a, b) => a.value > b.value ? a : b); notes.push('Range evaluated at its upper bound (P-01/P-04).'); }
  else {
    const tier = text.match(/(?:up to|upto)\s+(\d[\d,]*)/i);
    if (tier && quotes.length >= 2) { selected = thread.quantity > Number(tier[1].replace(/,/g, '')) ? quotes[1] : quotes[0]; notes.push(`Quantity ${thread.quantity} selects the matching price tier.`); }
  }
  const rate = supplier.fx?.[selected.currency] ?? book.fx[selected.currency];
  if (rate === undefined) return { price: null, missing: `${selected.currency} is not in the approved exchange table.` };
  const suffix = text.slice(selected.end, text.indexOf('\n', selected.end) < 0 ? text.length : text.indexOf('\n', selected.end));
  const monthly = /per month|\/\s*(?:month|mo)\b|monthly/i.test(suffix);
  const yearly = /per year|\/\s*(?:year|yr)\b|yearly|annually|per annum/i.test(suffix);
  const subscription = /per (?:month|year)/.test(category.unit);
  if (subscription && !monthly && !yearly) return { price: null, missing: 'Subscription offer has no usable billing period.' };
  let p = selected.value * rate;
  notes.push(`${selected.currency} ${selected.value} × FX ${rate} = INR ${p}.`);
  if (/including GST|inclusive of GST|incl\.? GST|GST included|GST-inclusive/i.test(text)) { p /= 1 + category.gst / 100; notes.push(`Exclude ${category.gst}% GST: divide by ${1 + category.gst / 100}.`); }
  const total = suffix.match(/in total for all\s+(\d[\d,]*)/i);
  if (total) { p /= Number(total[1].replace(/,/g, '')); notes.push(`Total quote divided by ${total[1]} units.`); }
  if (/per dozen/i.test(suffix)) { p /= 12; notes.push('Per-dozen price divided by 12.'); }
  if (thread.category === 'led-lighting' && /per pack of 4/i.test(suffix)) { p /= 4; notes.push('Pack of four fixtures divided by 4.'); }
  if (thread.category === 'printer-paper' && /per ream/i.test(suffix)) { p *= 10; notes.push('Ten reams per normalized box: multiply by 10.'); }
  const perN = suffix.match(/\bper\s+(\d+)\s+[a-z]+/i);
  if (perN && Number(perN[1]) > 1) {
    p /= Number(perN[1]);
    notes.push(`Per ${perN[1]} sub-units quote divided by ${perN[1]}.`);
  }
  if (subscription && monthly && category.unit.includes('per year')) { p *= 12; notes.push('Monthly subscription annualized: multiply by 12 (P-06).'); }
  if (subscription && yearly && category.unit.includes('per month')) { p /= 12; notes.push('Annual subscription converted to monthly: divide by 12.'); }
  const listDiscount = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)[\s\S]{0,40}list price/i);
  if (listDiscount) { p *= 1 - Number(listDiscount[1]) / 100; notes.push(`${listDiscount[1]}% list-price discount applied.`); }
  const bonus = text.match(/(?:plus\s+)?(?:1|one)\s+(?:\w+\s+)?free(?:\s+\w+)?\s+for every\s+(\d+)/i);
  if (bonus) { const n = Number(bonus[1]); p *= n / (n + 1); notes.push(`Volume bonus: multiply by ${n}/${n + 1} (P-02/P-05).`); }
  const volumeOrders = text.match(/further\s+(\d+)%\s+off for orders of\s+(\d+)\s+[a-z]+\s+or more/i);
  if (volumeOrders && thread.quantity >= Number(volumeOrders[2])) {
    p *= 1 - Number(volumeOrders[1]) / 100;
    notes.push(`Eligible volume discount applied: ${volumeOrders[1]}% off for orders >= ${volumeOrders[2]}.`);
  }
  const volume = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)[\s\S]{0,70}(?:at least|minimum of|over|above)\s+(\d+)/i);
  if (volume && !listDiscount && !volumeOrders) {
    const inclusive = /at least|minimum of/i.test(volume[0]);
    if (inclusive ? thread.quantity >= Number(volume[2]) : thread.quantity > Number(volume[2])) { p *= 1 - Number(volume[1]) / 100; notes.push('Eligible quantity-based discount applied.'); }
  }
  if (!Number.isFinite(p) || p < 0) throw new Error('Unsupported or invalid price expression.');
  return { price: p, missing: null };
}
export function evaluate(thread: Thread, book: Playbook): Result {
  const audit: AuditStep[] = [];
  const result: Result = { thread, action: 'ESCALATE', reason: 'MISSING_INFO', label: '', price: null, limit: null, total: null, audit };
  const step = (title: string, detail: string, source: string, status: AuditStep['status'] = 'pass') => audit.push({ title, detail, source, status });
  const finish = (action: Result['action'], reason: string, counter?: number) => {
    result.action = action; result.reason = reason;
    result.label = `${action}:${reason}:${action === 'COUNTER' ? Math.floor(counter! + 0.5 + Number.EPSILON * counter!) : ''}`;
    return result;
  };
  try {
    const policy = effectivePolicy(thread, book);
    const notes: string[] = [];
    const offer = normalize(latestMessage(thread.supplier_message), thread, book, earlierSupplier(thread.supplier_message, thread.supplier), notes);
    if (offer.missing) { step('01 · Missing information', offer.missing, 'decision-procedure.md §1; units-and-currency.md', 'stop'); return finish('ESCALATE', 'MISSING_INFO'); }
    step('01 · Complete offer', 'Usable price, approved currency and required billing period found.', 'decision-procedure.md §1');
    if (policy.supplier.status === 'BLACKLISTED') { step('02 · Supplier status', `${thread.supplier} is blacklisted.`, 'Supplier overrides; decision-procedure.md §2', 'stop'); return finish('REJECT', 'BLACKLISTED_SUPPLIER'); }
    step('02 · Supplier status', policy.supplier.status === 'PROBATION' ? 'Probation: zero concessions.' : 'Supplier is not blacklisted.', 'Supplier overrides');
    const injection = injectionEvidence(thread.supplier_message);
    if (injection) { step('03 · Security guardrail', `Untrusted instruction: “${injection}”`, 'security-policy.md; P-08', 'stop'); return finish('ESCALATE', 'PROMPT_INJECTION'); }
    step('03 · Security guardrail', 'No supported injection pattern found across the entire history.', 'security-policy.md');
    const banned = bannedEvidence(latestMessage(thread.supplier_message));
    if (banned) { step('04 · Contract terms', `Banned clause: “${banned}”`, 'banned-terms.md; P-07', 'stop'); return finish('ESCALATE', 'BANNED_TERM'); }
    step('04 · Contract terms', 'Latest supplier terms pass the banned-clause checks.', 'banned-terms.md');
    result.price = offer.price; result.limit = policy.limit; result.total = offer.price! * thread.quantity;
    step('05 · Price normalization', notes.join(' '), 'units-and-currency.md; P-01–P-06', 'info');
    const changes = policy.applied.map(a => `${a.id}: ${a.field} = ${a.value}`).join('; ');
    step('05 · Effective policy', `Target ${policy.category.target}; walk-away ${policy.category.walkaway}; R=${policy.category.rounds}; β=${policy.category.beta}.${changes ? ' Amendments: ' + changes + '.' : ''}${policy.cap !== undefined ? ' Supplier contract cap takes precedence.' : ''}`, `categories/${thread.category}; amendments; suppliers`, 'info');
    step('05 · Concession level', `L(${thread.round}) = ${policy.limit}; normalized offer = ${offer.price}. ${policy.supplier.status === 'PROBATION' ? 'Probation fixes the level at target.' : 'Full precision retained for comparisons.'}`, 'concession-schedule.md');
    const EPS = 1e-9;
    if (offer.price! > policy.limit + EPS) {
      if (thread.round >= policy.category.rounds) { step('05 · Final-round decision', 'Offer exceeds the permissible level on the final round.', 'decision-procedure.md §5', 'stop'); return finish('REJECT', 'ABOVE_WALKAWAY'); }
      step('05 · Counteroffer', 'Offer exceeds the current level; counter at L(r), rounded half-up.', 'decision-procedure.md §5; output-format.md', 'stop'); return finish('COUNTER', 'COUNTER_OFFER', policy.limit);
    }
    if (result.total! > policy.category.approval + EPS) { step('06 · Approval authority', `Total ${result.total} exceeds approval limit ${policy.category.approval}.`, 'approval-limits.md; decision-procedure.md §6', 'stop'); return finish('ESCALATE', 'OVER_APPROVAL_LIMIT'); }
    step('06 · Approval authority', `Total ${result.total} is within approval limit ${policy.category.approval}.`, 'approval-limits.md; decision-procedure.md §6');
    return finish('ACCEPT', 'ACCEPTABLE_PRICE');
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Evaluation failed';
    result.label = '';
    step('Processing blocked', result.error, 'Input validation', 'stop');
    return result;
  }
}

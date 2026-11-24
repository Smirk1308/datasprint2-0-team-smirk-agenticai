import os, sys, re, math
from decimal import Decimal, ROUND_HALF_UP
import pandas as pd

def round_half_up(val):
    d = Decimal(str(val))
    return int(d.quantize(Decimal('1'), rounding=ROUND_HALF_UP))

WORDS = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
    'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
}
SCALES = {
    'hundred': 100,
    'thousand': 1000,
    'lakh': 100000,
    'crore': 10000000
}

def words_to_number(text):
    tokens = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    current = 0
    total = 0
    found_any = False
    for tok in tokens:
        if tok in WORDS:
            current += WORDS[tok]
            found_any = True
        elif tok in SCALES:
            found_any = True
            scale = SCALES[tok]
            if current == 0:
                current = 1
            if scale == 100:
                current *= scale
            else:
                total += current * scale
                current = 0
    if not found_any:
        return None
    total += current
    return total

class PlaybookEvaluator:
    def __init__(self, playbook_dir='playbook/playbook'):
        self.playbook_dir = playbook_dir
        self.categories = {}
        self.amendments = []
        self.suppliers = {}
        self.base_fx = {
            'USD': 84.5,
            'EUR': 91.0,
            'GBP': 106.0,
            'INR': 1.0,
            'RS': 1.0
        }
        self.load_playbook()

    def load_playbook(self):
        cat_dir = os.path.join(self.playbook_dir, 'categories')
        for f in os.listdir(cat_dir):
            cat_name = f.replace('.md', '')
            with open(os.path.join(cat_dir, f), 'r') as fp:
                content = fp.read()
            
            unit = re.search(r'\*\*Normalized unit:\*\*\s*(.*)', content).group(1).strip()
            gst_str = re.search(r'\*\*GST rate:\*\*\s*(\d+)%', content).group(1)
            target_str = re.search(r'\*\*Target price:\*\*\s*₹?([\d,]+)', content).group(1)
            walkaway_str = re.search(r'\*\*Walk-away price:\*\*\s*₹?([\d,]+)', content).group(1)
            rounds_str = re.search(r'\*\*Negotiation rounds \(R\):\*\*\s*(\d+)', content).group(1)
            beta_str = re.search(r'\*\*Concession exponent \(β\):\*\*\s*([\d\.]+)', content).group(1)
            limit_str = re.search(r'\*\*Approval limit:\*\*\s*₹?([\d,]+)', content).group(1)
            
            self.categories[cat_name] = {
                'unit': unit,
                'gst_rate': float(gst_str) / 100.0,
                'target': float(target_str.replace(',', '')),
                'walkaway': float(walkaway_str.replace(',', '')),
                'R': int(rounds_str),
                'beta': float(beta_str),
                'approval_limit': float(limit_str.replace(',', ''))
            }

        amd_dir = os.path.join(self.playbook_dir, 'amendments')
        cat_map = {
            'Catering': 'catering',
            'Cleaning services': 'cleaning',
            'Cloud servers': 'cloud-servers',
            'Courier services': 'courier',
            'CRM licenses': 'crm-licenses',
            'Design software': 'design-software',
            'Headsets': 'headsets',
            'Laptops': 'laptops',
            'LED lighting': 'led-lighting',
            'Mobile phones': 'mobile-phones',
            'Monitors': 'monitors',
            'Office chairs': 'office-chairs',
            'Printer paper': 'printer-paper',
            'Security guards': 'security-guards',
            'Training workshops': 'training'
        }
        for f in sorted(os.listdir(amd_dir)):
            with open(os.path.join(amd_dir, f), 'r') as fp:
                content = fp.read()
            amd_id = f.replace('.md', '')
            cat_match = re.search(r'#\s*AMD-\d+:\s*(.*)', content)
            cat_title = cat_match.group(1).strip()
            eff_match = re.search(r'\*\*Effective from:\*\*\s*([\d-]+)', content)
            eff_date = eff_match.group(1).strip()
            cat_name = cat_map[cat_title]
            
            walkaway_change = re.search(r'walk-away price for .* is now ₹?([\d,]+)', content)
            target_change = re.search(r'target price for .* is now ₹?([\d,]+)', content)
            limit_change = re.search(r'approval limit for .* is now ₹?([\d,]+)', content)
            
            change_dict = {}
            if walkaway_change:
                change_dict['walkaway'] = float(walkaway_change.group(1).replace(',', ''))
            if target_change:
                change_dict['target'] = float(target_change.group(1).replace(',', ''))
            if limit_change:
                change_dict['approval_limit'] = float(limit_change.group(1).replace(',', ''))
                
            self.amendments.append({
                'id': amd_id,
                'category': cat_name,
                'effective_date': eff_date,
                'changes': change_dict
            })
        self.amendments.sort(key=lambda x: x['effective_date'])

        sup_dir = os.path.join(self.playbook_dir, 'suppliers')
        for f in os.listdir(sup_dir):
            with open(os.path.join(sup_dir, f), 'r') as fp:
                content = fp.read()
            sup_name = re.search(r'#\s*Supplier:\s*(.*)', content).group(1).strip()
            status_line = re.search(r'\*\*Status:\*\*\s*(.*)', content).group(1).strip()
            
            if 'BLACKLISTED' in status_line:
                status = 'BLACKLISTED'
            elif 'PROBATION' in status_line:
                status = 'PROBATION'
            else:
                status = 'APPROVED'
                
            contracts = {'fx': {}, 'cap': {}}
            contract_match = re.search(r'\*\*Contract:\*\*\s*(.*)', content)
            if contract_match:
                contract_str = contract_match.group(1).strip()
                fx_match = re.search(r'invoices in (GBP|USD|EUR) are converted at ₹?([\d\.]+)', contract_str)
                if fx_match:
                    contracts['fx'][fx_match.group(1)] = float(fx_match.group(2))
                cap_match = re.search(r'price cap for (.*) of ₹?([\d,]+) per .* \(replaces the walk-away price\)', contract_str)
                if cap_match:
                    cat_t = cap_match.group(1).strip()
                    cap_cat = cat_map[cat_t]
                    cap_val = float(cap_match.group(2).replace(',', ''))
                    contracts['cap'][cap_cat] = cap_val
                    
            self.suppliers[sup_name] = {
                'status': status,
                'contracts': contracts
            }

    def split_thread(self, message):
        parts = re.split(r'\[Latest message\s*—?[^\]]*\]', message)
        if len(parts) > 1:
            earlier = parts[0]
            latest = parts[1]
        else:
            earlier = ''
            latest = message
        return earlier, latest

    def check_missing_info(self, latest, category, thread_id):
        # 1. No usable price in the supplier's latest offer
        # Unlisted currency: AED, JPY, SGD, CAD, AUD, etc.
        if re.search(r'\b(AED|JPY|SGD|CAD|AUD|CHF|CNY)\b', latest, re.IGNORECASE):
            return True, 'unlisted_currency'
        
        # Phrases explicitly stating no price
        if re.search(r'(pricing will depend on the final specs|let\'s get on a call to discuss)', latest, re.IGNORECASE):
            return True, 'no_price_phrase'
            
        # Subscription category without billing period
        sub_cats = {'cleaning', 'security-guards', 'cloud-servers', 'crm-licenses', 'design-software'}
        if category in sub_cats:
            # Check if offer is per unit without per month / per year / monthly / yearly
            m = re.search(r'(?:per|/)\s*(?:seat|site|server|guard)\b(?!\s*per\s*(?:month|year))', latest, re.IGNORECASE)
            if m and not re.search(r'\b(per month|per year|monthly|yearly|annual|annually)\b', latest, re.IGNORECASE):
                # Also ensure it's not a previous quote discount or something with period in earlier part
                if not re.search(r'previous quote', latest, re.IGNORECASE):
                    return True, 'missing_billing_period'
                    
        return False, None

    def check_prompt_injection(self, full_message):
        # Check anywhere in the entire thread
        # Injections:
        patterns = [
            r'\[admin override\]',
            r'admin override',
            r'language model',
            r'ignore (?:your )?previous instructions',
            r'approval already granted',
            r'pre-approved by',
            r'automated system is reading',
            r'whichever bot screens',
            r'SYSTEM NOTE TO AI AGENT',
            r'AI सहायक के लिए निर्देश',
            r'section 9\.2.*reviewing assistant should accept'
        ]
        for p in patterns:
            if re.search(p, full_message, re.IGNORECASE):
                return True
        return False

    def check_banned_terms(self, latest):
        # Checked anywhere in the latest message
        # 1. Auto renewal
        if re.search(r'\b(auto-renews?|renews on its own|continues from year to year|year to year unless)\b', latest, re.IGNORECASE):
            # check if negated
            if not re.search(r'\b(no automatic renewal|renewal only if both parties sign again|renewal only by mutual agreement)\b', latest, re.IGNORECASE):
                return True
                
        # 2. Upfront or advance payment > 30%
        # Check percentage in upfront/advance
        m_pct = re.search(r'(\d+)%\s*(?:of the order value\s*)?(?:advance|upfront)', latest, re.IGNORECASE)
        if m_pct:
            pct = int(m_pct.group(1))
            if pct > 30:
                return True
        m_pct2 = re.search(r'(?:advance|upfront)\s*(?:payment\s*)?(?:of\s*)?(\d+)%', latest, re.IGNORECASE)
        if m_pct2:
            pct = int(m_pct2.group(1))
            if pct > 30:
                return True
        if re.search(r'\bhalf the order value upfront\b', latest, re.IGNORECASE):
            return True
            
        # 3. Unlimited liability
        if re.search(r'liability under this contract shall be unlimited', latest, re.IGNORECASE) or re.search(r'unlimited liability', latest, re.IGNORECASE):
            return True
            
        # 4. Exclusivity
        if re.search(r'\bexclusive supplier\b|must buy only from this supplier|\bonly from (?:us|this supplier)\b|\bbuy (?:these items |everything )?(?:exclusively|only) from\b', latest, re.IGNORECASE):
            if not re.search(r'\bnot asking for exclusivity\b', latest, re.IGNORECASE):
                return True
                
        return False

    def parse_raw_number(self, s):
        s = s.replace(',', '').strip()
        # check k or lakh with digits first (e.g. 1.2 lakh, 18.5k)
        m_k = re.search(r'(\d+(?:\.\d+)?)\s*k\b', s, re.IGNORECASE)
        if m_k:
            return float(m_k.group(1)) * 1000.0
        m_lakh = re.search(r'(\d+(?:\.\d+)?)\s*lakh\b', s, re.IGNORECASE)
        if m_lakh:
            return float(m_lakh.group(1)) * 100000.0
        # check if word number (e.g. one lakh seven thousand)
        wn = words_to_number(s)
        if wn is not None:
            return float(wn)
        m_num = re.search(r'\d+(?:\.\d+)?', s)
        if m_num:
            return float(m_num.group(0))
        return None

    def extract_supplier_previous_quote(self, earlier, supplier_name):
        # Look for the last quote from supplier in earlier messages
        # E.g. [Earlier message — Supplier, Date]
        # Our quote is ... / Our earlier quote was ... / We can do ...
        # Match lines with price
        lines = earlier.splitlines()
        for line in reversed(lines):
            line_str = line.strip()
            if re.search(r'(?:our (?:earlier )?quote (?:is|was)|we can do|best we can offer is)\s*([^\.]+)', line_str, re.IGNORECASE):
                # parse price from this line
                val = self.parse_line_price(line_str)
                if val is not None:
                    return val
        return None

    def parse_line_price(self, line):
        # Check range: between X and Y
        m_range = re.search(r'between\s+(?:Rs\.?|INR|₹|\$|USD|€|EUR|£|GBP)?\s*([\d,\.]+)\s+and\s+(?:Rs\.?|INR|₹|\$|USD|€|EUR|£|GBP)?\s*([\d,\.]+)', line, re.IGNORECASE)
        if m_range:
            return self.parse_raw_number(m_range.group(2))
        
        # Check currency and number
        m_cur = re.search(r'(?:Rs\.?|INR|₹|\$|USD|€|EUR|£|GBP)\s*([\d,\.]+(?:\s*(?:k|lakh))?)', line, re.IGNORECASE)
        if m_cur:
            return self.parse_raw_number(m_cur.group(1))
            
        m_cur_post = re.search(r'([\d,\.]+)\s*(?:rupees|inr|usd|eur|gbp)', line, re.IGNORECASE)
        if m_cur_post:
            return self.parse_raw_number(m_cur_post.group(1))
            
        # Check words
        wn = words_to_number(line)
        if wn is not None:
            return float(wn)
            
        return None

    def extract_price(self, earlier, latest, category, quantity, supplier_name):
        # 1. Check CORRECTION
        m_corr = re.search(r'CORRECTION\s*—\s*the price in my previous email should read\s+([^\n,]+?)(?:,\s*not|\.|\n|$)', latest, re.IGNORECASE)
        if m_corr:
            corr_text = m_corr.group(1)
            # Find the price in corr_text
            p = self.parse_line_price(corr_text)
            if p is not None:
                return p, corr_text

        # 2. Check "D% off our previous quote"
        m_prev_disc = re.search(r'further\s+(\d+)%\s+off our previous quote', latest, re.IGNORECASE)
        if m_prev_disc:
            disc_pct = float(m_prev_disc.group(1))
            prev_price = self.extract_supplier_previous_quote(earlier, supplier_name)
            if prev_price is not None:
                p = prev_price * (1.0 - disc_pct / 100.0)
                return p, latest

        # 3. Check tiered prices:
        # "{P1} for orders of up to {N} ..., and {P2} for larger orders"
        m_tier = re.search(r'([^\n]+?)\s+for orders of up to\s+(\d+)\s+[^,]+,\s+and\s+([^\n]+?)\s+for larger orders', latest, re.IGNORECASE)
        if m_tier:
            p1_str, thresh_str, p2_str = m_tier.group(1), m_tier.group(2), m_tier.group(3)
            thresh = int(thresh_str)
            chosen_str = p1_str if quantity <= thresh else p2_str
            p = self.parse_line_price(chosen_str)
            if p is not None:
                return p, chosen_str

        # 4. Check list price discount:
        # "{D}% discount on our list price of {X}"
        m_list_disc = re.search(r'(\d+)%\s+discount on our list price of\s+([^\n]+?)\s+per\b', latest, re.IGNORECASE)
        if not m_list_disc:
            m_list_disc = re.search(r'(\d+)%\s+discount on our list price of\s+([^\n\.]+)', latest, re.IGNORECASE)
        if m_list_disc:
            disc_pct = float(m_list_disc.group(1))
            base_p = self.parse_line_price(m_list_disc.group(2))
            if base_p is not None:
                p = base_p * (1.0 - disc_pct / 100.0)
                return p, latest

        # 5. Check "in total for all N units"
        m_tot = re.search(r'([^\n]+?)\s+in total for all\s+(\d+)', latest, re.IGNORECASE)
        if m_tot:
            tot_p = self.parse_line_price(m_tot.group(1))
            n_units = float(m_tot.group(2))
            if tot_p is not None and n_units > 0:
                p = tot_p / n_units
                return p, latest

        # 6. Check general offer lines
        # Look for lines with price
        for line in latest.splitlines():
            line_str = line.strip()
            if not line_str: continue
            # skip payment terms or notes
            if re.search(r'^(payment terms|prices valid|delivery within|warranty|standard net|acme agrees|we need|a \d+% upfront)', line_str, re.IGNORECASE):
                continue
            if re.search(r'(?:quote|offer|we can do|final price is|revised offer is|best we can offer is)', line_str, re.IGNORECASE):
                p = self.parse_line_price(line_str)
                if p is not None:
                    return p, line_str

        # Fallback: scan any line with currency/number
        for line in latest.splitlines():
            line_str = line.strip()
            if re.search(r'(?:Rs\.?|INR|₹|\$|USD|€|EUR|£|GBP)\s*[\d,\.]+', line_str, re.IGNORECASE):
                p = self.parse_line_price(line_str)
                if p is not None:
                    return p, line_str
                    
        return None, None

    def normalize_price(self, raw_price, context_text, category, supplier_name, quantity=None):
        p = raw_price
        
        # 1. Currency
        # Determine currency
        cur = 'INR'
        if re.search(r'(\$|\bUSD\b)', context_text, re.IGNORECASE):
            cur = 'USD'
        elif re.search(r'(€|\bEUR\b)', context_text, re.IGNORECASE):
            cur = 'EUR'
        elif re.search(r'(£|\bGBP\b)', context_text, re.IGNORECASE):
            cur = 'GBP'
            
        # Currency rate
        sup_fx = self.suppliers[supplier_name]['contracts']['fx']
        if cur in sup_fx:
            fx_rate = sup_fx[cur]
        else:
            fx_rate = self.base_fx.get(cur, 1.0)
        p = p * fx_rate
        
        # 2. Buy X get Y free:
        # "plus 1 free {unit} for every {N} you pay for"
        m_free = re.search(r'plus\s+(\d+)\s+free\s+.*?for every\s+(\d+)\s+you pay for', context_text, re.IGNORECASE)
        if m_free:
            y = float(m_free.group(1))
            x = float(m_free.group(2))
            p = p * (x / (x + y))
            
        # 3. Packs and sub-units:
        if re.search(r'per pack of 4 fixtures', context_text, re.IGNORECASE):
            p = p / 4.0
        elif re.search(r'per dozen', context_text, re.IGNORECASE):
            p = p / 12.0
        elif re.search(r'per ream', context_text, re.IGNORECASE) and category == 'printer-paper':
            p = p * 10.0 # 1 box = 10 reams
        else:
            m_per_n = re.search(r'\bper\s+(\d+)\s+[a-z]+', context_text, re.IGNORECASE)   # e.g. "per 100 fixtures"
            if m_per_n and int(m_per_n.group(1)) > 1:
                p = p / float(m_per_n.group(1))

        # 3b. Volume discount: "a further D% off for orders of N <units> or more" -> only if quantity >= N
        m_vol = re.search(r'further\s+(\d+)%\s+off for orders of\s+(\d+)\s+[a-z]+\s+or more', context_text, re.IGNORECASE)
        if m_vol and quantity is not None and quantity >= int(m_vol.group(2)):
            p = p * (1.0 - int(m_vol.group(1)) / 100.0)
            
        # 4. Duration conversion:
        # CRM, Design, Cloud servers are yearly. If monthly -> x 12
        if category in {'crm-licenses', 'design-software', 'cloud-servers'}:
            if re.search(r'per\s*(?:seat|server)?\s*per month', context_text, re.IGNORECASE):
                p = p * 12.0
        # Cleaning, Security guards are monthly. If yearly -> / 12
        if category in {'cleaning', 'security-guards'}:
            if re.search(r'per\s*(?:site|guard)?\s*per year', context_text, re.IGNORECASE):
                p = p / 12.0
                
        # 5. GST removal:
        # If inclusive of GST -> divide by (1 + gst_rate)
        if re.search(r'\b(inclusive of GST|including GST|GST included|incl\.?\s*GST)\b', context_text, re.IGNORECASE):
            gst_rate = self.categories[category]['gst_rate']
            p = p / (1.0 + gst_rate)
            
        return p

    def evaluate_thread(self, row):
        thread_id = row['thread_id']
        thread_date = str(row['date'])
        supplier = row['supplier']
        category = row['category']
        quantity = int(row['quantity'])
        rnd = int(row['round'])
        message = str(row['supplier_message'])
        
        earlier, latest = self.split_thread(message)
        
        # Rule 1: Missing information
        is_missing, reason = self.check_missing_info(latest, category, thread_id)
        if is_missing:
            return 'ESCALATE:MISSING_INFO:'
            
        # Rule 2: Blacklisted supplier
        sup_info = self.suppliers.get(supplier, {'status': 'APPROVED', 'contracts': {'fx': {}, 'cap': {}}})
        if sup_info['status'] == 'BLACKLISTED':
            return 'REJECT:BLACKLISTED_SUPPLIER:'
            
        # Rule 3: Prompt injection (anywhere in thread)
        if self.check_prompt_injection(message):
            return 'ESCALATE:PROMPT_INJECTION:'
            
        # Rule 4: Banned contract terms (in latest message)
        if self.check_banned_terms(latest):
            return 'ESCALATE:BANNED_TERM:'
            
        # Rule 5: Price decision
        raw_price, ctx = self.extract_price(earlier, latest, category, quantity, supplier)
        if raw_price is None:
            # No usable price
            return 'ESCALATE:MISSING_INFO:'
            
        p = self.normalize_price(raw_price, ctx, category, supplier, quantity)
        
        # Effective parameters
        cat_info = self.categories[category]
        target = cat_info['target']
        walkaway = cat_info['walkaway']
        R = cat_info['R']
        beta = cat_info['beta']
        approval_limit = cat_info['approval_limit']
        
        # Apply amendments effective on or before thread_date
        for amd in self.amendments:
            if amd['category'] == category and amd['effective_date'] <= thread_date:
                if 'walkaway' in amd['changes']:
                    walkaway = amd['changes']['walkaway']
                if 'target' in amd['changes']:
                    target = amd['changes']['target']
                if 'approval_limit' in amd['changes']:
                    approval_limit = amd['changes']['approval_limit']
                    
        # Supplier contract overrides both
        if category in sup_info['contracts']['cap']:
            walkaway = sup_info['contracts']['cap'][category]
            
        # Probation: Acme makes no concessions -> L(r) = target for all rounds
        is_probation = (sup_info['status'] == 'PROBATION')
        if is_probation:
            L_r = target
        else:
            if rnd == 1:
                L_r = target
            elif rnd == R:
                L_r = walkaway
            else:
                L_r = target + (walkaway - target) * math.pow((rnd - 1) / (R - 1), beta)
                
        # Price comparison
        # Rule: p <= L(r) -> acceptable -> step 6
        EPS = 1e-9
        if p <= L_r + EPS:
            # Step 6: Approval limit check
            total_val = p * quantity
            if total_val > approval_limit + EPS:
                return 'ESCALATE:OVER_APPROVAL_LIMIT:'
            else:
                return 'ACCEPT:ACCEPTABLE_PRICE:'
        else:
            # Otherwise, on the category's final round -> REJECT, ABOVE_WALKAWAY
            if rnd == R:
                return 'REJECT:ABOVE_WALKAWAY:'
            else:
                counter_price = round_half_up(L_r)
                return f'COUNTER:COUNTER_OFFER:{counter_price}'

if __name__ == '__main__':
    evaluator = PlaybookEvaluator()
    sample_df = pd.read_csv('sample_threads.csv')
    answers_df = pd.read_csv('sample_answers.csv')
    
    correct = 0
    total = len(sample_df)
    
    for i, r in sample_df.iterrows():
        pred = evaluator.evaluate_thread(r)
        actual = answers_df.iloc[i]['label']
        match = (pred == actual)
        if match:
            correct += 1
        else:
            print(f'MISMATCH [{r.thread_id}]: pred={pred} vs actual={actual}')
            earlier, latest = evaluator.split_thread(r.supplier_message)
            print('  Latest:', latest.strip())
            
    print(f'\nAccuracy: {correct}/{total} ({correct/total*100:.1f}%)')

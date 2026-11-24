# Acme Autonomous Procurement Desk — DataSprint 2.0

**Track:** Agentic AI  
**Team:** Shubh Sharma (`smirk1308`)  
**Competition:** DataSprint 2.0 (Team Anveshan, The National Institute of Engineering, Mysuru)  
**Kaggle Public Leaderboard Score:** **`1.00000` (100% Accuracy — Perfect Score)**  
**Live Deployed UI:** [https://datasprint2-0-team-smirk-agenticai-six.vercel.app/](https://datasprint2-0-team-smirk-agenticai-six.vercel.app/)

---

## 🎯 Executive Overview

This repository provides an autonomous AI procurement agent engineered to evaluate supplier negotiations, interpret multi-turn email threads, enforce Acme Corp's corporate procurement playbook, and make auditable decisions: **ACCEPT**, **COUNTER**, **REJECT**, or **ESCALATE** with mathematically precise whole-rupee counteroffers.

### 🏛️ 5-Stage Policy Precedence Hierarchy

Decisions strictly follow Acme Corp's procurement hierarchy:

```
[Supplier Message Thread]
         │
         ▼
[Step 1: Missing Information Check] ──► (Missing quote, unlisted currency, or missing period) ──► ESCALATE:MISSING_INFO:
         │ (Complete)
         ▼
[Step 2: Supplier Blacklist Check]   ──► (Supplier status == BLACKLISTED) ────────────────────► REJECT:BLACKLISTED_SUPPLIER:
         │ (Approved / Probation)
         ▼
[Step 3: Security & Injection Check] ──► (Adversarial prompt injection anywhere in thread) ───► ESCALATE:PROMPT_INJECTION:
         │ (Safe)
         ▼
[Step 4: Banned Contract Terms]      ──► (Exclusivity, Auto-renewal, Unlimited liability, >30% upfront) ──► ESCALATE:BANNED_TERM:
         │ (Compliant terms)
         ▼
[Step 5: Concession Schedule & Caps]
   ├── Effective Target & Walk-away calculation with dated amendments
   ├── Supplier-specific Contract price cap overrides
   ├── Concession Curve: L(r) = Target + (Walk-away - Target) * ((r-1)/(R-1))^beta
   ├── Supplier on PROBATION ─────────► Zero concessions (L(r) = Target for all rounds)
   │
   ├── If Offer <= L(r):
   │     ├── Total Spend (Price * Qty) > Approval Limit ────────────────────────────────► ESCALATE:OVER_APPROVAL_LIMIT:
   │     └── Total Spend <= Approval Limit ─────────────────────────────────────────────► ACCEPT:ACCEPTABLE_PRICE:
   │
   └── If Offer > L(r):
         ├── Final Round (r == R) ──────────────────────────────────────────────────────► REJECT:ABOVE_WALKAWAY:
         └── Earlier Round (r < R) ─────────────────────────────────────────────────────► COUNTER:COUNTER_OFFER:<round_half_up(L(r))>
```

---

## 🛠️ Key Engine Features in Version 6

- **Sub-unit Centum Scaling (`per 100`):** Normalizes quotes per 100 fixtures, meals, or shipments into single-unit comparisons.
- **Dual Exclusivity Detection:** Flags both Template 1 (`exclusive supplier`) and Template 2 (`"Acme will buy these items only from us"`).
- **Volume Discounts:** Automatically checks threshold conditions (`further D% off for orders of N or more`) before evaluating concession schedules.
- **Deterministic Precedence:** Strict step-by-step audit logging with zero hallucination risk.
- **Numerical & Floating Point Precision:** IEEE 754 precision buffering (`EPS = 1e-9`) and exact half-up rounding.

---

## 📁 Repository Structure

```
├── evaluator.py                 # Core Python deterministic evaluation engine
├── solution_notebook.ipynb      # Standalone reproducible Jupyter Notebook
├── submission_v6_final.csv      # Confirmed 1.00000 Kaggle submission file
├── playbook/                    # Acme Corp procurement playbook rules
│   ├── categories/              # Base targets, walk-aways, rounds, betas, caps
│   ├── suppliers/               # Approved, probation, and blacklisted supplier contracts
│   ├── amendments/              # Time-stamped policy amendments
│   └── policies/                # Banned terms, units & currency, security guardrails
├── public/data/                 # Evaluation datasets (threads.csv, sample threads)
└── src/                         # Full-stack interactive React + TypeScript web app
    └── lib/procurement/         # Client-side deterministic engine matching Python v6
```

---

## 💻 Running Locally

### Python Engine
```bash
python evaluator.py
```

### Full-Stack Web Application
```bash
npm install
npm run dev
```

Visit `http://localhost:5173` to explore the interactive procurement workbench, inspect step-by-step audit logs for any thread, and export verified submission batches.

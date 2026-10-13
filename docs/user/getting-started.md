# Getting Started

## 1. Create a float

1. Create a non-group **Cash** account per float (for example `Petty Cash - Main - ABBR` under `Cash In Hand`).
2. Open **Petty Cash → Settings** (or `/desk/petty-cash-float/new`) and pick the cost centre, petty cash account, replenishment bank account, imprest amount and replenishment trigger. Save.
3. Repeat with **New Float** for each cost centre.

Saving with a company and an empty template table seeds six expense templates (Fuel & Transport, Airtime & Data, Office Supplies, Cleaning & Consumables, Repairs & Maintenance, Miscellaneous). A template whose account is missing falls back to the float's default expense account.

## 2. Give people access

Give the person who holds the float the **Petty Cash Custodian** role plus **Accounts User** (vouchers are submitted with the user's own permissions). To limit a custodian to their own float, add a **User Permission** on their Cost Center.

| Role | Access |
|---|---|
| System Manager | everything |
| Accounts Manager | page; floats read, write, create |
| Petty Cash Custodian | page; float read. The Settings tab shows only if **Allow Cashiers to View Settings** is on |

## 3. Daily use

Open **Petty Cash** from the apps screen. Pick the float in the page header.

| Tab | What it does |
|---|---|
| Dashboard | Balance, replenishment status, today's spend, quick actions, recent transactions |
| Transactions | Petty cash GL rows with date and type filters, paging, In/Out/Net totals, CSV export |
| Journal Entries | Create a balanced Journal Entry against petty cash |
| Payments | Payment Entries paid from petty cash |
| Replenishments | Draft Bank Entries for the Accounts Manager to submit |
| Settings | The selected float, including **New Float** |

Quick actions:

- **Record Expense** submits a Cash Entry from an expense template. Cost Center defaults to the float's; choose another non-group cost centre of the same company to charge it elsewhere.
- **Pay Supplier** submits a Payment Entry from petty cash, allocated against the supplier's outstanding Purchase Invoices.
- **Replenish Cash** submits a Bank Entry from the replenishment bank account up to the imprest amount.

## Multi-company rules

- A float belongs to the company of its cost centre; its accounts must be that company's, and every voucher is posted in that company.
- One float per cost centre, each with its own cash account.
- A custom Journal Entry must include the float's petty cash account and rejects accounts or cost centres of another company.

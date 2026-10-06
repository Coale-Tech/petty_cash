### Petty Cash

Imprest-style petty cash console for ERPNext v16, as a single Desk page (`/app/petty-cash`).
Every money movement is a native ERPNext voucher; the balance is the GL balance of the
petty cash account (`erpnext.accounts.utils.get_balance_on`), so nothing keeps a second copy
of a number.

| Tab | What it does |
|---|---|
| Dashboard | Balance, replenishment status (below the trigger), today's spend, quick actions, recent transactions |
| Transactions | Petty cash GL rows: date/type filters, paging (25/50/100), In/Out/Net totals, CSV export |
| Journal Entries | Create a balanced JE against petty cash; recent JEs that touch the account |
| Payments | Payment Entries paid from petty cash |
| Replenishments | Replenishment requests (draft Bank Entries for the Accounts Manager to submit) |
| Settings | Company, imprest amount, trigger, accounts, expense templates, controls |

Quick actions:

- **Record Expense** - submits a Cash Entry Journal Entry from an expense template (debit the template's expense account, credit petty cash)
- **Pay Supplier** - submits a Payment Entry from petty cash, allocated against the supplier's outstanding Purchase Invoices
- **Replenish Cash** - submits a Bank Entry from the replenishment bank account back up to the imprest amount

#### Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/Coale-Tech/petty_cash --branch main
bench --site <site> install-app petty_cash
bench build --app petty_cash
```

Requires `erpnext`.

#### Configure

1. Create a non-group **Cash** account for the float (e.g. `Petty Cash - ABBR` under `Cash In Hand`).
2. Open **Petty Cash -> Settings** (or `/app/petty-cash-settings`), pick the company, petty cash account,
   replenishment bank account, imprest amount and trigger, then save.
   Saving with a company and an empty template table seeds six expense templates (Fuel & Transport, Airtime & Data,
   Office Supplies, Cleaning & Consumables, Repairs & Maintenance, Miscellaneous) mapped to the standard
   chart's expense accounts; templates whose account is missing fall back to the default expense account.
3. Give the person who holds the float the **Petty Cash Custodian** role plus **Accounts User**
   (vouchers are submitted with the user's own permissions).

#### Roles

| Role | Access |
|---|---|
| System Manager | everything |
| Accounts Manager | page + settings read/write |
| Petty Cash Custodian | page + settings read; the Settings tab is visible only if "Allow Cashiers to View Settings" is on |

#### Notes

- Assets are bundled as `petty_cash_desk.bundle.{js,css}`; bundle names are bench-wide, so another app's
  `petty_cash.bundle.*` cannot shadow them.
- Cannot be installed on a site that already defines the `Petty Cash Settings` / `Petty Cash Expense Template`
  doctypes or the `petty-cash` page from another app.

#### License

gpl-3.0

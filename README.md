### Petty Cash

Imprest-style petty cash console for ERPNext v16, as a single Desk page (`/desk/petty-cash`).
Every money movement is a native ERPNext voucher; the balance is the GL balance of the
petty cash account (`erpnext.accounts.utils.get_balance_on`), so nothing keeps a second copy
of a number.

Each cost centre runs its own float (**Petty Cash Float**, named after the cost centre, with its own cash
account). The page header has a float selector; every voucher row it creates carries that cost centre.

| Tab | What it does |
|---|---|
| Dashboard | Balance, replenishment status (below the trigger), today's spend, quick actions, recent transactions |
| Transactions | Petty cash GL rows: date/type filters, paging (25/50/100), In/Out/Net totals, CSV export |
| Journal Entries | Create a balanced JE against petty cash; recent JEs that touch the account |
| Payments | Payment Entries paid from petty cash |
| Replenishments | Replenishment requests (draft Bank Entries for the Accounts Manager to submit) |
| Settings | The selected float: cost centre, imprest amount, trigger, accounts, expense templates, controls; **New Float** |

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

1. Create a non-group **Cash** account per float (e.g. `Petty Cash - Main - ABBR` under `Cash In Hand`).
2. Open **Petty Cash -> Settings** (or `/desk/petty-cash-float/new`), pick the cost centre, petty cash account,
   replenishment bank account, imprest amount and trigger, then save. Repeat with **New Float** for each cost centre.
   Saving with a company and an empty template table seeds six expense templates (Fuel & Transport, Airtime & Data,
   Office Supplies, Cleaning & Consumables, Repairs & Maintenance, Miscellaneous) mapped to the standard
   chart's expense accounts; templates whose account is missing fall back to the default expense account.
3. Give the person who holds the float the **Petty Cash Custodian** role plus **Accounts User**
   (vouchers are submitted with the user's own permissions). To limit a custodian to their own float, add a
   **User Permission** on their Cost Center.

#### Roles

| Role | Access |
|---|---|
| System Manager | everything |
| Accounts Manager | page + floats read/write/create |
| Petty Cash Custodian | page + float read; the Settings tab is visible only if "Allow Cashiers to View Settings" is on |

#### Customer Statement

- Report **Customer Statement** (Selling sidebar; also **View -> Customer Statement**
  on the Customer form): opening balance, invoices/payments/returns with running balance, ageing.
- **Statement PDF** renders the `Customer Statement` print format (Chrome PDF generator) with the issuer's logo,
  address, tax ID and contacts from the Company and the first company Bank Account as payment details.
  Styled on Espresso tokens (`print.bundle.css` variables, Inter) with a running head and paged footer; layout
  borrowed from vigilant's statement (itself adapted from kimzone).

#### Add Multiple Items

- The native **Add multiple** button under the items table of Quotation, Sales Order/Invoice, Delivery Note,
  Supplier Quotation, Purchase Order/Receipt/Invoice, Material Request and Stock Entry opens kimzone's **Select
  Items** dialog instead of the one-at-a-time link selector: search by Item Code / Item Name / Free Text (every
  word must match), **Item in Stock** / **Zero Stock Only** filters, a resizable table with a column per leaf
  warehouse of the company, list price and Total Qty, tick rows and set quantities, **Add Selected Items**,
  double-click to add one row. Selections survive new searches. No second button, no Custom Field. BOM,
  Opportunity and Blanket Order keep the native selector.
- Sales Invoice and Delivery Note refuse items with no stock (skipped items are listed), and pick the warehouse
  with the most stock. Existing rows for the same item get their quantity increased.
- Selling documents list only sales items, buying documents only purchase items. Price = list rate from the
  document's price list; the row's real rate still comes from ERPNext's `get_item_details` when it lands.
- Not ported from kimzone: customer-first guard, territory columns, retail/wholesale cached prices.

#### Notes

- Assets are bundled as `petty_cash_desk.bundle.{js,css}`; bundle names are bench-wide, so another app's
  `petty_cash.bundle.*` cannot shadow them.
- Cannot be installed on a site that already defines the `Petty Cash Float` / `Petty Cash Expense Template`
  doctypes, the `petty-cash` page, or a `Customer Statement` report/print format (e.g. from `raven`).
- Upgrading from the single `Petty Cash Settings` doctype: `migrate` turns it into a float on the company's
  default cost centre.

#### License

gpl-3.0

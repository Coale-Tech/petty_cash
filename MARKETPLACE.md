# Petty Cash

Imprest petty cash console for **ERPNext v16**, as a single Desk page.

Every money movement is a native ERPNext voucher and the balance is the GL balance of the float's cash account, so nothing keeps a second copy of a number. Each cost centre runs its own float with its own cash account, and every voucher is posted in the float's company.

> This file is the canonical **Frappe Cloud Marketplace "Long Description"** source. It deliberately contains **no installation commands** (no `get-app`, `install-app`, or migration commands), which the marketplace metadata check rejects. Paste it into the listing's Long Description field, or sync the listing from it.

## Key Features

- Dashboard with balance, replenishment status, today's spend, quick actions and recent transactions
- Per-cost-centre floats (**Petty Cash Float**) with imprest amount, replenishment trigger, accounts and expense templates
- **Record Expense** — submits a Cash Entry Journal Entry from an expense template
- **Pay Supplier** — submits a Payment Entry from petty cash, allocated against the supplier's outstanding Purchase Invoices
- **Replenish Cash** — submits a Bank Entry back up to the imprest amount
- Transactions, Journal Entries, Payments and Replenishments tabs with filters, paging and CSV export
- **Petty Cash Custodian** role; limit a custodian to their own float with a User Permission on their Cost Center
- **Customer Statement** report and print format: opening balance, running balance, ageing, issuer details and bank payment details
- **Add Multiple Items** dialog on every ERPNext items table: search, stock filters, a quantity column per warehouse
- Multi-company safe: a float's vouchers, accounts and cost centres must belong to one company

## How It Works

A float belongs to the company of its cost centre. The Petty Cash page creates standard Journal Entries, Payment Entries and Bank Entries with the user's own permissions, so ERPNext's normal accounting controls, audit trail and reports apply. Saving a float with an empty template table seeds six expense templates mapped to the standard chart's expense accounts.

## Installation

Available on the Frappe Cloud Marketplace. ERPNext is provisioned automatically as a dependency.

## License

GPL-3.0

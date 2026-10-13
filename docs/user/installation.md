# Installation

## Frappe Cloud

Add **Petty Cash** from the Marketplace to your bench group and install it on your site. ERPNext is installed as a dependency.

## Self-hosted

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/Coale-Tech/petty_cash --branch main
bench --site <site> install-app petty_cash
bench build --app petty_cash
```

Requires Frappe v16 and ERPNext v16.

## Uninstall

```bash
bench --site <site> uninstall-app petty_cash
```

The Customer Statement link is removed from the Selling sidebar. Floats and vouchers are kept in the database until you delete them; the vouchers are ordinary ERPNext Journal, Payment and Bank Entries.

## Conflicts

Petty Cash cannot be installed on a site that already defines the `Petty Cash Float` or `Petty Cash Expense Template` DocTypes, the `petty-cash` page, or a `Customer Statement` report or print format.

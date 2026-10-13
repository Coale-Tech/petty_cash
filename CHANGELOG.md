# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0]

### Added
- Frappe Cloud Marketplace packaging: `MARKETPLACE.md`, `[tool.bench.frappe-dependencies]`, user docs, CI and linter workflows.
- `before_uninstall` hook removes the Customer Statement link from the Selling sidebar.
- Screenshots in `docs/user/screenshots`.
- Tests for install/uninstall and guest permission denial.

### Fixed
- Customer Statement ageing now has a **Not Due** bucket; before, amounts not yet past due were missing and the buckets did not add up to the closing balance.
- Pay Supplier dialog said the payment would *debit* the petty cash account; it credits it.
- Customer Statement report columns no longer truncate dates, types and references.

### Changed
- `required_apps` uses the `frappe/erpnext` form.
- Support contact is `support@coale.tech`.

## [0.0.1]

- Petty Cash page, floats, expense templates, Customer Statement report and print format, Add Multiple Items dialog.

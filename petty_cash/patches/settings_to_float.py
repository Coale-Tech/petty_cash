"""Petty Cash Settings (single) became one Petty Cash Float per cost centre:
move the old single onto a float for the company's default cost centre."""

import frappe
from frappe.query_builder import DocType

from petty_cash.api import TEMPLATE_FIELDS

FIELDS = (
	"imprest_amount",
	"replenishment_trigger",
	"petty_cash_account",
	"bank_account",
	"default_expense_account",
	"require_receipt_reference",
	"allow_cashier_settings_view",
)


def execute():
	singles = DocType("Singles")
	old = frappe._dict(
		frappe.qb.from_(singles)
		.select(singles.field, singles.value)
		.where(singles.doctype == "Petty Cash Settings")
		.run()
	)
	tpl = DocType("Petty Cash Expense Template")
	rows = (
		frappe.qb.from_(tpl)
		.select(*TEMPLATE_FIELDS)
		.where(tpl.parenttype == "Petty Cash Settings")
		.orderby(tpl.idx)
		.run(as_dict=True)
	)
	cost_center = old.company and frappe.get_cached_value("Company", old.company, "cost_center")
	if old.petty_cash_account and cost_center and not frappe.db.exists("Petty Cash Float", cost_center):
		doc = frappe.new_doc("Petty Cash Float")
		doc.update({f: old.get(f) for f in FIELDS})
		doc.cost_center = cost_center
		doc.set("expense_templates", rows)
		doc.insert(ignore_permissions=True)
	frappe.qb.from_(tpl).delete().where(tpl.parenttype == "Petty Cash Settings").run()
	frappe.db.delete("Singles", {"doctype": "Petty Cash Settings"})

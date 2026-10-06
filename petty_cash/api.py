"""Endpoints behind the ``petty-cash`` Desk page.

The petty cash balance IS the GL balance of ``Petty Cash Settings.petty_cash_account``.
Every money movement is a native ERPNext voucher: expenses and replenishments
are Journal Entries, supplier payments are Payment Entries, so nothing here
keeps a second copy of a number.
"""

import frappe
from frappe import _
from frappe.query_builder import DocType, Order
from frappe.utils import flt, getdate, nowdate

GLE = DocType("GL Entry")
TEMPLATE_FIELDS = (
	"template_name",
	"journal_entry_template",
	"expense_category",
	"description",
	"debit_account",
	"credit_account",
)


def _settings(require_configured=True):
	settings = frappe.get_single("Petty Cash Settings")
	if require_configured and not settings.petty_cash_account:
		frappe.throw(_("Petty Cash Settings not configured"))
	return settings


def _gl_rows(account, criterion=None, limit=20):
	"""Non-cancelled GL rows on the petty cash account, newest first; ``limit=0`` = all."""
	query = (
		frappe.qb.from_(GLE)
		.select(
			GLE.name,
			GLE.posting_date,
			GLE.voucher_type,
			GLE.voucher_no,
			GLE.debit,
			GLE.credit,
			GLE.remarks,
			GLE.against,
			GLE.creation,
		)
		.where((GLE.account == account) & (GLE.is_cancelled == 0))
		.orderby(GLE.posting_date, order=Order.desc)
		.orderby(GLE.creation, order=Order.desc)
	)
	if criterion is not None:
		query = query.where(criterion)
	if limit:
		query = query.limit(limit)
	rows = query.run(as_dict=True)
	for row in rows:
		row.transaction_type = "Replenishment" if flt(row.debit) > 0 else "Expense"
	return rows


def _template(t):
	return {"name": t.name, **{f: t.get(f) for f in TEMPLATE_FIELDS}}


def has_app_permission():
	"""Show the Petty Cash tile on the apps screen only to users who can read the settings."""
	return bool(frappe.has_permission("Petty Cash Settings", "read"))


@frappe.whitelist()
def get_petty_cash_dashboard():
	frappe.has_permission("Petty Cash Settings", "read", throw=True)
	settings = _settings(require_configured=False)
	if not settings.petty_cash_account:
		return {
			"configured": False,
			"company": settings.company or frappe.defaults.get_user_default("Company"),
		}

	today = _gl_rows(settings.petty_cash_account, GLE.posting_date == getdate(), limit=0)
	return {
		"configured": True,
		"current_balance": settings.get_current_balance(),
		"imprest_amount": flt(settings.imprest_amount),
		"replenishment_trigger": flt(settings.replenishment_trigger),
		"needs_replenishment": settings.needs_replenishment(),
		"replenishment_amount": settings.get_replenishment_amount(),
		"petty_cash_account": settings.petty_cash_account,
		"bank_account": settings.bank_account,
		"company": settings.company,
		"require_receipt_reference": settings.require_receipt_reference,
		"templates": [_template(t) for t in settings.expense_templates],
		"recent_transactions": _gl_rows(settings.petty_cash_account),
		"today_summary": {
			"total_in": sum(flt(r.debit) for r in today),
			"total_out": sum(flt(r.credit) for r in today),
			"expense_count": sum(1 for r in today if flt(r.credit) > 0),
			"replenishment_count": sum(1 for r in today if flt(r.debit) > 0),
		},
	}


@frappe.whitelist()
def get_petty_cash_transactions(
	from_date: str | None = None,
	to_date: str | None = None,
	transaction_type: str | None = None,
	limit: int = 500,
):
	frappe.has_permission("Petty Cash Settings", "read", throw=True)
	settings = _settings(require_configured=False)
	if not settings.petty_cash_account:
		return []

	criterion = GLE.posting_date >= getdate(from_date) if from_date else GLE.posting_date.notnull()
	if to_date:
		criterion &= GLE.posting_date <= getdate(to_date)
	if transaction_type == "Expense":
		criterion &= GLE.credit > 0
	elif transaction_type == "Replenishment":
		criterion &= GLE.debit > 0
	return _gl_rows(settings.petty_cash_account, criterion, limit)


@frappe.whitelist(methods=["POST"])
def create_expense(
	template_name: str,
	amount: float,
	posting_date: str | None = None,
	description: str | None = None,
	receipt_reference: str | None = None,
):
	"""Direct expense: Journal Entry debiting the template's expense account, crediting petty cash."""
	frappe.has_permission("Journal Entry", "submit", throw=True)
	settings = _settings()
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero"))
	if settings.require_receipt_reference and not receipt_reference:
		frappe.throw(_("Receipt reference is required"))

	template = next(
		(t for t in settings.expense_templates if template_name in (t.name, t.template_name)), None
	)
	if not template:
		frappe.throw(_("Expense template '{0}' not found").format(template_name))

	balance = settings.get_current_balance()
	if balance < amount:
		frappe.throw(_("Insufficient petty cash balance. Current balance: {0}").format(balance))

	debit_account = template.debit_account or settings.default_expense_account
	if not debit_account:
		frappe.throw(_("No expense account configured for this template"))

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Cash Entry"
	if template.journal_entry_template:
		je_template = frappe.db.get_value(
			"Journal Entry Template",
			template.journal_entry_template,
			["voucher_type", "naming_series"],
			as_dict=True,
		)
		je.voucher_type = je_template.voucher_type or "Cash Entry"
		if je_template.naming_series:
			je.naming_series = je_template.naming_series
	je.posting_date = getdate(posting_date) if posting_date else nowdate()
	je.company = settings.company
	je.user_remark = description or _("Petty cash expense: {0}").format(template.template_name)
	if receipt_reference:
		je.cheque_no = receipt_reference
		je.cheque_date = je.posting_date
	je.append(
		"accounts",
		{
			"account": debit_account,
			"debit_in_account_currency": amount,
			"cost_center": frappe.get_cached_value("Company", settings.company, "cost_center"),
			# v16 create_remarks drops the header user_remark once cheque_no is set; row remarks reach the GL
			"user_remark": je.user_remark,
		},
	)
	je.append(
		"accounts",
		{
			"account": template.credit_account or settings.petty_cash_account,
			"credit_in_account_currency": amount,
			"user_remark": je.user_remark,
		},
	)
	je.insert()
	je.submit()
	return {"success": True, "journal_entry": je.name}


def _replenishment_je(settings, petty_cash_account, bank_account, amount, posting_date):
	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Bank Entry"
	je.posting_date = getdate(posting_date) if posting_date else nowdate()
	je.company = settings.company
	je.cheque_no = f"REP-{je.posting_date}"
	je.cheque_date = je.posting_date
	je.append("accounts", {"account": petty_cash_account, "debit_in_account_currency": amount})
	je.append("accounts", {"account": bank_account, "credit_in_account_currency": amount})
	return je


@frappe.whitelist(methods=["POST"])
def replenish_petty_cash(
	amount: float | None = None,
	bank_account: str | None = None,
	posting_date: str | None = None,
	reference_no: str | None = None,
):
	"""Top the float back up: submitted Bank Entry debiting petty cash, crediting the bank."""
	frappe.has_permission("Petty Cash Settings", "write", throw=True)
	frappe.has_permission("Journal Entry", "submit", throw=True)
	settings = _settings()
	amount = flt(amount) if amount else settings.get_replenishment_amount()
	if amount <= 0:
		frappe.throw(_("No replenishment needed. Petty cash is at or above imprest level."))
	bank_account = bank_account or settings.bank_account
	if not bank_account:
		frappe.throw(_("Bank account not specified and no default configured"))

	je = _replenishment_je(settings, settings.petty_cash_account, bank_account, amount, posting_date)
	je.user_remark = _("Petty cash replenishment to imprest level")
	for row in je.accounts:
		row.user_remark = je.user_remark
	if reference_no:
		je.cheque_no = reference_no
	je.insert()
	je.submit()
	return {
		"success": True,
		"journal_entry": je.name,
		"amount": amount,
		"new_balance": settings.get_current_balance(),
	}


def _access():
	can_manage = bool(frappe.has_permission("Petty Cash Settings", "write"))
	can_read = bool(frappe.has_permission("Petty Cash Settings", "read"))
	allow_view = frappe.db.get_single_value("Petty Cash Settings", "allow_cashier_settings_view")
	return {
		"can_manage_settings": can_manage,
		"can_view_settings": can_manage or bool(can_read and allow_view),
		"can_create_transactions": bool(frappe.has_permission("Journal Entry", "submit")),
	}


@frappe.whitelist()
def check_user_access():
	return _access()


@frappe.whitelist()
def get_petty_cash_settings():
	if not _access()["can_view_settings"]:
		frappe.throw(_("Not permitted to view petty cash settings"), frappe.PermissionError)
	s = _settings(require_configured=False)
	return {
		"company": s.company,
		"imprest_amount": s.imprest_amount,
		"replenishment_trigger": s.replenishment_trigger,
		"petty_cash_account": s.petty_cash_account,
		"bank_account": s.bank_account,
		"default_expense_account": s.default_expense_account,
		"require_receipt_reference": s.require_receipt_reference,
		"allow_cashier_settings_view": s.allow_cashier_settings_view,
		"expense_templates": [_template(t) for t in s.expense_templates],
	}


@frappe.whitelist(methods=["POST"])
def save_petty_cash_settings(settings: str | dict):
	frappe.has_permission("Petty Cash Settings", "write", throw=True)
	data = frappe._dict(frappe.parse_json(settings))
	doc = _settings(require_configured=False)
	if data.company:
		doc.company = data.company
	for field in ("imprest_amount", "replenishment_trigger"):
		if data.get(field) is not None:
			doc.set(field, flt(data.get(field)))
	for field in ("petty_cash_account", "bank_account", "default_expense_account"):
		doc.set(field, data.get(field) or None)
	for field in ("require_receipt_reference", "allow_cashier_settings_view"):
		doc.set(field, 1 if data.get(field) else 0)
	doc.set("expense_templates", [])
	for t in data.get("expense_templates") or []:
		if t.get("template_name"):
			doc.append("expense_templates", {f: t.get(f) or None for f in TEMPLATE_FIELDS})
	doc.save()
	return {"success": True}


@frappe.whitelist()
def get_supplier_details(supplier: str, company: str):
	frappe.has_permission("Supplier", "read", supplier, throw=True)
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_outstanding_reference_documents
	from erpnext.accounts.party import get_party_account

	payable_account = get_party_account("Supplier", supplier, company)
	# erpnext msgprints "No outstanding invoices found" on an empty result; the dialog shows its own empty state
	frappe.flags.mute_messages = True
	try:
		docs = get_outstanding_reference_documents(
			{
				"posting_date": nowdate(),
				"party_type": "Supplier",
				"party": supplier,
				"company": company,
				"party_account": payable_account,
				"get_outstanding_invoices": True,
				"get_orders_to_be_billed": False,
			}
		)
	finally:
		frappe.flags.mute_messages = False
	invoices = [
		{
			"voucher_type": d.get("voucher_type"),
			"voucher_no": d.get("voucher_no"),
			"posting_date": d.get("posting_date"),
			"invoice_amount": flt(d.get("invoice_amount")),
			"outstanding_amount": flt(d.get("outstanding_amount")),
			"due_date": d.get("due_date"),
			"allocated_amount": 0,
		}
		for d in docs
	]
	return {
		"supplier": supplier,
		"supplier_name": frappe.db.get_value("Supplier", supplier, "supplier_name"),
		"default_currency": frappe.get_cached_value("Company", company, "default_currency"),
		"payable_account": payable_account,
		"outstanding_invoices": invoices,
		"total_outstanding": sum(i["outstanding_amount"] for i in invoices),
	}


@frappe.whitelist()
def get_purchase_invoice_details(invoice_name: str):
	frappe.has_permission("Purchase Invoice", "read", invoice_name, throw=True)
	inv = frappe.get_doc("Purchase Invoice", invoice_name)
	pe = frappe.qb.DocType("Payment Entry")
	ref = frappe.qb.DocType("Payment Entry Reference")
	payments = (
		frappe.qb.from_(ref)
		.join(pe)
		.on(pe.name == ref.parent)
		.select(ref.parent.as_("payment_entry"), ref.allocated_amount, pe.posting_date, pe.mode_of_payment)
		.where(
			(ref.reference_doctype == "Purchase Invoice")
			& (ref.reference_name == invoice_name)
			& (pe.docstatus == 1)
		)
		.run(as_dict=True)
	)
	return {
		"name": inv.name,
		"supplier": inv.supplier,
		"supplier_name": inv.supplier_name,
		"posting_date": inv.posting_date,
		"due_date": inv.due_date,
		"status": inv.status,
		"grand_total": inv.grand_total,
		"net_total": inv.net_total,
		"total_taxes_and_charges": inv.total_taxes_and_charges,
		"outstanding_amount": inv.outstanding_amount,
		"paid_amount": flt(inv.grand_total) - flt(inv.outstanding_amount),
		"currency": inv.currency,
		"bill_no": inv.bill_no,
		"bill_date": inv.bill_date,
		"remarks": inv.remarks,
		"items": [
			{
				f: i.get(f)
				for f in (
					"item_code",
					"item_name",
					"description",
					"qty",
					"uom",
					"rate",
					"amount",
					"warehouse",
				)
			}
			for i in inv.items
		],
		"taxes": [
			{
				f: t.get(f)
				for f in ("charge_type", "account_head", "description", "rate", "tax_amount", "total")
			}
			for t in inv.taxes
		],
		"payments": payments,
	}


def _journal_entries(account, limit, replenishments_only=False):
	je = frappe.qb.DocType("Journal Entry")
	jea = frappe.qb.DocType("Journal Entry Account")
	query = (
		frappe.qb.from_(je)
		.join(jea)
		.on(jea.parent == je.name)
		.select(
			je.name,
			je.posting_date,
			je.title,
			je.voucher_type,
			je.total_debit,
			je.total_credit,
			je.user_remark,
			je.cheque_no,
			je.docstatus,
			je.creation,
		)
		.distinct()
		.where(jea.account == account)
		.orderby(je.posting_date, order=Order.desc)
		.orderby(je.creation, order=Order.desc)
		.limit(limit)
	)
	if replenishments_only:
		query = query.where((jea.debit_in_account_currency > 0) & (je.voucher_type == "Bank Entry"))
	else:
		query = query.where(je.docstatus != 2)
	return query.run(as_dict=True)


@frappe.whitelist()
def get_recent_journal_entries(limit: int = 50):
	frappe.has_permission("Journal Entry", "read", throw=True)
	settings = _settings(require_configured=False)
	if not settings.petty_cash_account:
		return {"data": []}
	return {"data": _journal_entries(settings.petty_cash_account, limit)}


@frappe.whitelist()
def get_recent_payment_entries(limit: int = 50):
	frappe.has_permission("Payment Entry", "read", throw=True)
	settings = _settings(require_configured=False)
	if not settings.petty_cash_account:
		return {"data": []}
	pe = DocType("Payment Entry")
	account = settings.petty_cash_account
	return {
		"data": frappe.qb.from_(pe)
		.select(
			pe.name,
			pe.posting_date,
			pe.party_type,
			pe.party,
			pe.party_name,
			pe.paid_amount,
			pe.received_amount,
			pe.mode_of_payment,
			pe.reference_no,
			pe.remarks,
			pe.docstatus,
			pe.creation,
		)
		.where(((pe.paid_from == account) | (pe.paid_to == account)) & (pe.docstatus != 2))
		.orderby(pe.posting_date, order=Order.desc)
		.orderby(pe.creation, order=Order.desc)
		.limit(limit)
		.run(as_dict=True)
	}


@frappe.whitelist()
def get_replenishment_requests(limit: int = 50):
	frappe.has_permission("Journal Entry", "read", throw=True)
	settings = _settings(require_configured=False)
	if not settings.petty_cash_account:
		return {"data": []}
	balance = settings.get_current_balance()
	status = {0: "Draft", 1: "Completed", 2: "Cancelled"}
	return {
		"data": [
			{
				"name": e.name,
				"posting_date": e.posting_date,
				"requested_amount": e.total_debit,
				"reason": e.user_remark,
				"reference_no": e.cheque_no,
				"docstatus": e.docstatus,
				"status": status[e.docstatus],
				"current_balance": balance,
			}
			for e in _journal_entries(settings.petty_cash_account, limit, replenishments_only=True)
		]
	}


@frappe.whitelist(methods=["POST"])
def create_journal_entry(data: str | dict):
	frappe.has_permission("Journal Entry", "submit", throw=True)
	data = frappe._dict(frappe.parse_json(data))
	je = frappe.new_doc("Journal Entry")
	je.company = data.company
	je.voucher_type = data.voucher_type or "Journal Entry"
	je.posting_date = getdate(data.posting_date) if data.posting_date else nowdate()
	je.title = data.title or None
	je.finance_book = data.finance_book or None
	je.user_remark = data.user_remark or None
	for row in data.accounts or []:
		je.append(
			"accounts",
			{
				"account": row.get("account"),
				"debit_in_account_currency": flt(row.get("debit_in_account_currency")),
				"credit_in_account_currency": flt(row.get("credit_in_account_currency")),
				**{
					f: row.get(f) or None
					for f in (
						"cost_center",
						"party_type",
						"party",
						"project",
						"reference_type",
						"reference_name",
					)
				},
				# GL remarks come from row user_remark (+ cheque reference); the header remark never reaches it
				"user_remark": row.get("user_remark") or je.user_remark,
			},
		)
	je.insert()
	je.submit()
	return {"success": True, "data": {"name": je.name}}


@frappe.whitelist(methods=["POST"])
def create_replenishment_request(data: str | dict):
	"""Draft Bank Entry for the Accounts Manager to review and submit."""
	frappe.has_permission("Journal Entry", "create", throw=True)
	data = frappe._dict(frappe.parse_json(data))
	settings = _settings()
	if not settings.bank_account:
		frappe.throw(_("Bank account not configured in Petty Cash Settings"))
	amount = flt(data.requested_amount)
	if amount <= 0:
		frappe.throw(_("Requested amount must be greater than zero"))
	je = _replenishment_je(
		settings,
		data.petty_cash_account or settings.petty_cash_account,
		settings.bank_account,
		amount,
		data.posting_date,
	)
	je.user_remark = data.reason or _("Petty cash replenishment request")
	je.insert()
	return {"success": True, "data": {"name": je.name}}


@frappe.whitelist(methods=["POST"])
def pay_supplier_with_references(
	supplier: str,
	amount: float,
	mode_of_payment: str | None = None,
	posting_date: str | None = None,
	reference_no: str | None = None,
	reference_date: str | None = None,
	remarks: str | None = None,
	references: str | list | None = None,
):
	frappe.has_permission("Payment Entry", "submit", throw=True)
	settings = _settings()
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero"))
	balance = settings.get_current_balance()
	if balance < amount:
		frappe.throw(_("Insufficient petty cash balance. Current balance: {0}").format(balance))

	details = get_supplier_details(supplier, settings.company)
	pe = frappe.new_doc("Payment Entry")
	pe.payment_type = "Pay"
	pe.party_type = "Supplier"
	pe.party = supplier
	pe.party_name = details["supplier_name"]
	pe.posting_date = getdate(posting_date) if posting_date else nowdate()
	pe.company = settings.company
	pe.mode_of_payment = mode_of_payment or "Cash"
	pe.paid_from = settings.petty_cash_account
	pe.paid_to = details["payable_account"]
	pe.paid_amount = amount
	pe.received_amount = amount
	pe.reference_no = reference_no or f"PC-{pe.posting_date}-{supplier}"
	pe.reference_date = getdate(reference_date) if reference_no and reference_date else pe.posting_date
	pe.remarks = remarks or _("Petty cash payment to {0}").format(details["supplier_name"])
	for ref in frappe.parse_json(references) or []:
		if flt(ref.get("allocated_amount")) > 0:
			pe.append(
				"references",
				{
					"reference_doctype": ref.get("voucher_type"),
					"reference_name": ref.get("voucher_no"),
					"allocated_amount": flt(ref.get("allocated_amount")),
					"outstanding_amount": flt(ref.get("outstanding_amount")),
					"total_amount": flt(ref.get("invoice_amount")),
				},
			)
	pe.insert()
	pe.submit()
	return {
		"success": True,
		"payment_entry": pe.name,
		"amount": pe.paid_amount,
		"supplier_name": details["supplier_name"],
		"references_count": len(pe.references),
	}

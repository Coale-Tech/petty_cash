import frappe
from erpnext.accounts.utils import get_balance_on
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

# (template, category, standard-chart expense account); the company abbreviation is appended at seed time
DEFAULT_EXPENSE_TEMPLATES = (
	("Fuel & Transport", "Transport", "Travel Expenses"),
	("Airtime & Data", "Utilities", "Telephone Expenses"),
	("Office Supplies", "Office Supplies", "Print and Stationery"),
	("Cleaning & Consumables", "Cleaning Supplies", "Office Maintenance Expenses"),
	("Repairs & Maintenance", "Maintenance", "Office Maintenance Expenses"),
	("Miscellaneous", "Miscellaneous", "Miscellaneous Expenses"),
)


class PettyCashFloat(Document):
	def validate(self):
		if self.petty_cash_account and self.bank_account and self.petty_cash_account == self.bank_account:
			frappe.throw(_("Petty Cash Account and Replenishment Bank Account must be different accounts."))
		if frappe.get_cached_value("Cost Center", self.cost_center, "is_group"):
			frappe.throw(
				_("Cost Center {0} is a group; pick a non-group cost centre.").format(self.cost_center)
			)
		for field in ("petty_cash_account", "bank_account", "default_expense_account"):
			account = self.get(field)
			if account and frappe.get_cached_value("Account", account, "company") != self.company:
				frappe.throw(
					_("{0} {1} does not belong to company {2}").format(
						_(self.meta.get_label(field)), account, self.company
					)
				)
		if self.company and not self.expense_templates:
			self.seed_expense_templates()

	def seed_expense_templates(self):
		"""Default templates; an account missing from a custom chart is left blank (falls back to the default expense account)."""
		abbr = frappe.get_cached_value("Company", self.company, "abbr")
		for template_name, category, account in DEFAULT_EXPENSE_TEMPLATES:
			account = f"{account} - {abbr}"
			self.append(
				"expense_templates",
				{
					"template_name": template_name,
					"expense_category": category,
					"debit_account": account if frappe.db.exists("Account", account) else None,
				},
			)
		if not self.default_expense_account and frappe.db.exists(
			"Account", f"Miscellaneous Expenses - {abbr}"
		):
			self.default_expense_account = f"Miscellaneous Expenses - {abbr}"

	def get_current_balance(self) -> float:
		"""Live petty cash balance = GL balance of the petty cash account."""
		if not self.petty_cash_account:
			return 0.0
		return flt(get_balance_on(account=self.petty_cash_account, company=self.company))

	def get_replenishment_amount(self) -> float:
		shortfall = flt(self.imprest_amount) - self.get_current_balance()
		return shortfall if shortfall > 0 else 0.0

	def needs_replenishment(self) -> bool:
		return self.get_current_balance() < flt(self.replenishment_trigger)

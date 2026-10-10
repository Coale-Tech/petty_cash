import unittest

import frappe
from frappe.tests import IntegrationTestCase

from petty_cash.api import _cost_center, create_journal_entry


class TestFloatScope(IntegrationTestCase):
	"""A float's vouchers stay in the float's company; the custom JE must touch the float's cash account."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.float = frappe.get_all("Petty Cash Float", pluck="name", limit=1)
		if not cls.float:
			raise unittest.SkipTest("Needs a Petty Cash Float")
		cls.settings = frappe.get_doc("Petty Cash Float", cls.float[0])
		cls.foreign_cc = frappe.db.get_value(
			"Cost Center", {"company": ["!=", cls.settings.company], "is_group": 0}, "name"
		)
		cls.foreign_account = frappe.db.get_value(
			"Account", {"company": ["!=", cls.settings.company], "is_group": 0}, "name"
		)

	def test_cost_center_must_be_same_company(self):
		if not self.foreign_cc:
			self.skipTest("Needs a cost centre of another company")
		with self.assertRaises(frappe.ValidationError):
			_cost_center(self.settings, self.foreign_cc)

	def test_cost_center_defaults_to_float(self):
		self.assertEqual(_cost_center(self.settings, None), self.settings.cost_center)

	def test_journal_entry_needs_the_float_cash_account(self):
		if not self.foreign_account:
			self.skipTest("Needs an account of another company")
		rows = [
			{"account": self.foreign_account, "debit_in_account_currency": 1},
			{"account": self.foreign_account, "credit_in_account_currency": 1},
		]
		with self.assertRaises(frappe.ValidationError):
			create_journal_entry({"accounts": rows}, self.settings.name)

	def test_journal_entry_rejects_other_company_account(self):
		if not self.foreign_account:
			self.skipTest("Needs an account of another company")
		rows = [
			{"account": self.foreign_account, "debit_in_account_currency": 1},
			{"account": self.settings.petty_cash_account, "credit_in_account_currency": 1},
		]
		with self.assertRaises(frappe.ValidationError):
			create_journal_entry({"accounts": rows}, self.settings.name)

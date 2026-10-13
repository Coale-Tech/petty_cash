import frappe
from frappe.tests import IntegrationTestCase

from petty_cash import api, install


def sidebar_rows():
	return frappe.get_all(
		"Sidebar Item",
		filters={
			"parenttype": "Custom Sidebar",
			"link_type": "Report",
			"link_to": install.STATEMENT_REPORT,
		},
		pluck="name",
	)


class TestInstall(IntegrationTestCase):
	def test_statement_link_is_added_once_and_removed_on_uninstall(self):
		install.after_install()
		install.after_migrate()
		self.assertEqual(len(sidebar_rows()), 1)

		install.before_uninstall()
		self.assertEqual(sidebar_rows(), [])

		install.after_migrate()
		self.assertEqual(len(sidebar_rows()), 1)


class TestPermissions(IntegrationTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_guest_cannot_read_or_post(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			api.get_petty_cash_dashboard()
		with self.assertRaises(frappe.PermissionError):
			api.create_journal_entry({"accounts": []}, "any")
		with self.assertRaises(frappe.PermissionError):
			api.pay_supplier_with_references("Supplier", "any", 1)
		self.assertFalse(api.has_app_permission())

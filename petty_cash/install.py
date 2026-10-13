import frappe
from frappe.desk.doctype.custom_sidebar.custom_sidebar import add_site_sidebar_item

STATEMENT_REPORT = "Customer Statement"


def add_customer_statement_to_selling_sidebar():
	"""Selling's sidebar is a standard erpnext Sidebar that migrate re-syncs from its JSON, so the link
	goes in the site layer (Custom Sidebar), which migrate never touches. Idempotent: an item already
	in the layer is skipped."""
	add_site_sidebar_item(
		"Selling",
		{
			"type": "Link",
			"label": STATEMENT_REPORT,
			"link_type": "Report",
			"link_to": STATEMENT_REPORT,
			"icon": "file-text",
		},
	)


def remove_customer_statement_from_selling_sidebar():
	"""Drop the row added above from every Custom Sidebar layer, so uninstall leaves no dead link."""
	frappe.db.delete(
		"Sidebar Item",
		{"parenttype": "Custom Sidebar", "link_type": "Report", "link_to": STATEMENT_REPORT},
	)
	frappe.clear_cache()


def after_install():
	add_customer_statement_to_selling_sidebar()


def after_migrate():
	add_customer_statement_to_selling_sidebar()


def before_uninstall():
	remove_customer_statement_from_selling_sidebar()

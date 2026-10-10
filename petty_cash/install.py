from frappe.desk.doctype.custom_sidebar.custom_sidebar import add_site_sidebar_item


def add_customer_statement_to_selling_sidebar():
	"""Selling's sidebar is a standard erpnext Sidebar that migrate re-syncs from its JSON, so the link
	goes in the site layer (Custom Sidebar), which migrate never touches. Idempotent: an item already
	in the layer is skipped."""
	add_site_sidebar_item(
		"Selling",
		{
			"type": "Link",
			"label": "Customer Statement",
			"link_type": "Report",
			"link_to": "Customer Statement",
			"icon": "file-text",
		},
	)

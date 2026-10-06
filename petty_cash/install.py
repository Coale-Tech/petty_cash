import frappe


def add_customer_statement_to_selling_sidebar():
	"""Selling's sidebar is a standard erpnext record that every migrate re-syncs from its JSON,
	so the Customer Statement link is re-added (after Customer Credit Balance) after each migrate."""
	if not frappe.db.exists("Report", "Customer Statement") or not frappe.db.exists(
		"Workspace Sidebar", "Selling"
	):
		return
	doc = frappe.get_doc("Workspace Sidebar", "Selling")
	if any(i.link_to == "Customer Statement" for i in doc.items):
		return
	pos = next((i.idx for i in doc.items if i.label == "Customer Credit Balance"), len(doc.items))
	doc.append(
		"items",
		{
			"type": "Link",
			"label": "Customer Statement",
			"link_type": "Report",
			"link_to": "Customer Statement",
			"child": 1,
		},
	)
	doc.items.insert(pos, doc.items.pop())
	for n, item in enumerate(doc.items, 1):
		item.idx = n
	doc.save(ignore_permissions=True)

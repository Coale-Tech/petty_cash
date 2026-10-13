app_name = "petty_cash"
app_title = "Petty Cash"
app_publisher = "CoaleTech"
app_description = "Imprest petty cash console for ERPNext: expenses, supplier payments, replenishments on native GL vouchers"
app_email = "support@coale.tech"
app_license = "gpl-3.0"

required_apps = ["frappe/erpnext"]

add_to_apps_screen = [
	{
		"name": "petty_cash",
		"logo": "/assets/petty_cash/images/petty-cash.svg",
		"title": "Petty Cash",
		"route": "/desk/petty-cash",
		"sequence_id": 10,
		"has_permission": "petty_cash.api.has_app_permission",
	}
]

fixtures = [{"dt": "Role", "filters": [["name", "=", "Petty Cash Custodian"]]}]

# Includes
app_include_css = "item_picker.bundle.css"
app_include_js = "item_picker.bundle.js"

# Customer Statement: Customer form button, print-format data function, Selling sidebar link
doctype_js = {"Customer": "public/js/customer.js"}
jinja = {"methods": ["petty_cash.petty_cash.report.customer_statement.customer_statement.get_statement"]}

# Installation
after_install = "petty_cash.install.after_install"
after_migrate = "petty_cash.install.after_migrate"
before_uninstall = "petty_cash.install.before_uninstall"

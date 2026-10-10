app_name = "petty_cash"
app_title = "Petty Cash"
app_publisher = "CoaleTech"
app_description = "Imprest petty cash console for ERPNext: expenses, supplier payments, replenishments on native GL vouchers"
app_email = "info@coale.tech"
app_license = "gpl-3.0"

# Apps
# ------------------

required_apps = ["erpnext"]

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

# Customer Statement: Customer form button, print-format data function, Selling sidebar link
doctype_js = {"Customer": "public/js/customer.js"}
jinja = {"methods": ["petty_cash.petty_cash.report.customer_statement.customer_statement.get_statement"]}
after_install = "petty_cash.install.add_customer_statement_to_selling_sidebar"
after_migrate = ["petty_cash.install.add_customer_statement_to_selling_sidebar"]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "item_picker.bundle.css"
app_include_js = "item_picker.bundle.js"

# include js, css files in header of web template
# web_include_css = "/assets/petty_cash/css/petty_cash.css"
# web_include_js = "/assets/petty_cash/js/petty_cash.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "petty_cash/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "petty_cash/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "petty_cash.utils.jinja_methods",
# 	"filters": "petty_cash.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "petty_cash.install.before_install"
# after_install = "petty_cash.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "petty_cash.uninstall.before_uninstall"
# after_uninstall = "petty_cash.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "petty_cash.utils.before_app_install"
# after_app_install = "petty_cash.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "petty_cash.utils.before_app_uninstall"
# after_app_uninstall = "petty_cash.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "petty_cash.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "petty_cash.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["petty_cash.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"petty_cash.tasks.all"
# 	],
# 	"daily": [
# 		"petty_cash.tasks.daily"
# 	],
# 	"hourly": [
# 		"petty_cash.tasks.hourly"
# 	],
# 	"weekly": [
# 		"petty_cash.tasks.weekly"
# 	],
# 	"monthly": [
# 		"petty_cash.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "petty_cash.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "petty_cash.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "petty_cash.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "petty_cash.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["petty_cash.utils.before_request"]
# after_request = ["petty_cash.utils.after_request"]

# Job Events
# ----------
# before_job = ["petty_cash.utils.before_job"]
# after_job = ["petty_cash.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"petty_cash.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

frappe.query_reports["Customer Statement"] = {
	filters: [
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
			reqd: 1,
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		// Opening / closing rows frame the statement and carry no voucher.
		return data && !data.reference ? `<b>${value}</b>` : value;
	},

	onload(report) {
		// The PDF renders the `Customer Statement` print format through the Chrome generator,
		// whose header/footer bands the template's page chrome is built for.
		report.page.add_inner_button(__("Statement PDF"), () => {
			const f = report.get_filter_values();
			if (!f.customer) return frappe.msgprint(__("Please select a Customer"));
			const q = new URLSearchParams({
				doctype: "Customer",
				name: f.customer,
				format: "Customer Statement",
				no_letterhead: 1,
				pdf_generator: "chrome",
				company: f.company,
				from_date: f.from_date,
				to_date: f.to_date,
			});
			window.open(`/api/method/frappe.utils.print_format.download_pdf?${q}`);
		});
	},
};

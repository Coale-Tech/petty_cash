frappe.pages["petty-cash"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Petty Cash"),
		single_column: true,
	});
	frappe.breadcrumbs.add("Petty Cash");

	// bundle names are bench-wide (assets.json); "_desk" avoids clashing with another app's petty_cash bundle
	frappe.require(["petty_cash_desk.bundle.js", "petty_cash_desk.bundle.css"], () => {
		wrapper.petty_cash = new petty_cash.PettyCashPage(page);
	});
};

frappe.pages["petty-cash"].on_page_show = function (wrapper) {
	wrapper.petty_cash?.refresh();
};

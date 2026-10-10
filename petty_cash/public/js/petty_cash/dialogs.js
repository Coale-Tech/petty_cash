// Petty-cash dialogs (hoteli ExpenseDialog / PaySupplierDialog / ReplenishDialog / InvoiceDetailDialog).
import { call, money, fmt_date, esc, icon, badge, voucher_link, empty_state } from "./utils";

const LOW_BALANCE = 1000; // hoteli threshold for the low-balance warnings

const alert_box = (color, icon_name, title, sub = "") =>
	`<div class="pc-alert pc-alert-${color}">${icon(icon_name, "md")}<div>${
		sub ? `<div class="pc-alert-title">${esc(title)}</div><div>${esc(sub)}</div>` : esc(title)
	}</div></div>`;

const stat = (label, value, cls = "") =>
	`<div><div class="pc-stat-label">${esc(
		label
	)}</div><div class="pc-strong ${cls}">${value}</div></div>`;

const spinner = (text) =>
	`<div class="pc-loading"><span class="pc-spin">${icon("loader")}</span>${esc(text)}</div>`;

function make_dialog(opts) {
	const d = new frappe.ui.Dialog({
		secondary_action_label: __("Cancel"),
		secondary_action: () => d.hide(),
		...opts,
	});
	d.$wrapper.addClass("pc-dialog");
	return d;
}

const set_valid = (d, ok) => d.get_primary_btn().prop("disabled", !ok);

// Primary action: lock the button, post, then close + toast + refresh. Server errors are shown by frappe.
async function submit(d, ctx, request, success_message) {
	const btn = d.get_primary_btn().prop("disabled", true);
	try {
		const r = await request();
		d.hide();
		frappe.show_alert({ message: success_message(r), indicator: "green" });
		ctx.refresh();
	} catch (e) {
		btn.prop("disabled", false);
	}
}

export function open_expense_dialog(ctx) {
	const db = ctx.dashboard;
	const balance = flt(db.current_balance);
	const templates = db.templates || [];
	const require_receipt = !!db.require_receipt_reference;
	let d;

	const render = () => {
		if (!d) return;
		const tpl = templates.find((t) => t.name === d.get_value("template"));
		const amount = flt(d.get_value("amount"));

		d.fields_dict.template_info.$wrapper.html(
			tpl
				? `<div class="pc-alert pc-alert-blue"><div class="pc-grow">
					<div class="pc-row-between"><span class="pc-strong">${esc(tpl.template_name)}</span>${
						tpl.journal_entry_template ? badge(__("JE Template"), "green") : ""
				  }</div>
					${tpl.description ? `<div class="pc-xs">${esc(tpl.description)}</div>` : ""}
					${
						tpl.journal_entry_template
							? `<div class="pc-xs pc-text-green">${icon("link", "xs")} ${esc(
									__("Linked to: {0}", [tpl.journal_entry_template])
							  )}</div>`
							: ""
					}
					${
						tpl.debit_account
							? `<div class="pc-xs pc-text-gray">${esc(
									__("Account: {0}", [tpl.debit_account])
							  )}</div>`
							: ""
					}
				</div></div>`
				: ""
		);

		const error =
			amount <= 0
				? __("Amount must be greater than zero")
				: amount > balance
				? __("Amount exceeds available balance ({0})", [money(balance)])
				: "";
		d.fields_dict.amount_status.$wrapper.html(
			error
				? `<div class="pc-field-msg pc-text-red">${icon("circle-alert")} ${esc(
						error
				  )}</div>`
				: `<div class="pc-field-msg pc-text-green">${icon("circle-check-big")} ${esc(
						__("Sufficient balance available")
				  )}</div>`
		);
		d.fields_dict.balance_error.$wrapper.html(
			amount > balance
				? alert_box(
						"red",
						"circle-x",
						__("Insufficient balance. Available: {0}", [money(balance)])
				  )
				: ""
		);

		set_valid(
			d,
			tpl &&
				!error &&
				d.get_value("posting_date") &&
				(!require_receipt || d.get_value("receipt_reference"))
		);
	};

	d = make_dialog({
		title: __("Record Expense"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "low_balance",
				options:
					balance < LOW_BALANCE
						? alert_box(
								"amber",
								"triangle-alert",
								__("Low balance: {0}", [money(balance)])
						  )
						: "",
			},
			{
				fieldtype: "Select",
				fieldname: "template",
				label: __("Expense Type"),
				reqd: 1,
				options: [
					{ label: __("Select expense type"), value: "" },
					...templates.map((t) => ({
						label: esc(
							`${t.template_name}${
								t.expense_category ? ` (${t.expense_category})` : ""
							}`
						),
						value: t.name || t.template_name,
					})),
				],
				onchange: render,
			},
			{ fieldtype: "HTML", fieldname: "template_info" },
			{
				fieldtype: "Currency",
				fieldname: "amount",
				label: __("Amount"),
				reqd: 1,
				onchange: render,
			},
			{ fieldtype: "HTML", fieldname: "amount_status" },
			{
				fieldtype: "Date",
				fieldname: "posting_date",
				label: __("Expense Date"),
				reqd: 1,
				default: frappe.datetime.get_today(),
				onchange: render,
			},
			{
				fieldtype: "Link",
				fieldname: "cost_center",
				options: "Cost Center",
				label: __("Cost Center"),
				default: db.cost_center,
				get_query: () => ({ filters: { company: db.company, is_group: 0 } }),
			},
			{
				fieldtype: "Data",
				fieldname: "receipt_reference",
				label: require_receipt
					? __("Receipt Reference")
					: __("Receipt Reference (Optional)"),
				placeholder: __("Receipt number"),
				reqd: require_receipt ? 1 : 0,
				onchange: render,
			},
			{
				fieldtype: "Small Text",
				fieldname: "description",
				label: __("Description"),
				placeholder: __("Details about the expense"),
			},
			{ fieldtype: "HTML", fieldname: "balance_error" },
		],
		primary_action_label: __("Record Expense"),
		primary_action: (v) => {
			const tpl = templates.find((t) => t.name === v.template);
			submit(
				d,
				ctx,
				() =>
					call("create_expense", {
						template_name: v.template,
						amount: v.amount,
						posting_date: v.posting_date,
						receipt_reference: v.receipt_reference,
						cost_center: v.cost_center,
						description: v.description,
					}),
				(r) =>
					__("Expense recorded using {0}: {1}", [
						tpl?.template_name || v.template,
						r.journal_entry,
					])
			);
		},
	});
	render();
	d.show();
}

export function open_pay_supplier_dialog(ctx) {
	const db = ctx.dashboard;
	const balance = flt(db.current_balance);
	let d;
	let details = null;
	let loading = false;
	let requested = null; // supplier whose details were last requested

	const invoices = () => details?.outstanding_invoices || [];

	const render = () => {
		if (!d) return;
		const amount = flt(d.get_value("amount"));
		const supplier = d.get_value("supplier");
		const mode = d.get_value("mode_of_payment");
		const invs = invoices();
		const total = flt(
			invs.reduce((s, i) => s + flt(i.allocated_amount), 0),
			2
		);
		const selected = invs.filter((i) => i.selected).length;
		const over = invs.filter((i) => flt(i.allocated_amount) > i.outstanding_amount);

		d.fields_dict.summary.$wrapper.html(
			supplier && amount > 0
				? `<div class="pc-alert pc-alert-gray"><div class="pc-grow">
					<div class="pc-box-title">${esc(__("Payment Summary"))}</div>
					<div class="pc-grid pc-grid-4">
						${stat(__("Supplier:"), esc(details?.supplier_name || supplier))}
						${stat(__("Payment Amount:"), money(amount))}
						${stat(
							__("Remaining Balance:"),
							money(balance - amount),
							amount > balance ? "pc-text-red" : "pc-text-green"
						)}
						${stat(__("Payment Mode:"), esc(mode || __("Cash")))}
					</div>
					${
						details?.total_outstanding > 0
							? `<div class="pc-divider-top pc-row-between"><span class="pc-stat-label">${esc(
									__("Total Outstanding:")
							  )}</span><span class="pc-strong pc-text-orange">${money(
									details.total_outstanding
							  )}</span></div>`
							: ""
					}
				</div></div>`
				: ""
		);

		const $inv = d.fields_dict.invoices.$wrapper;
		$inv.find(".pc-select-all").prop({
			checked: invs.length > 0 && selected === invs.length,
			indeterminate: selected > 0 && selected < invs.length,
		});
		$inv.find(".pc-selected-count").text(__("{0} of {1} selected", [selected, invs.length]));
		$inv.find(".pc-auto").prop("disabled", selected === 0 || !amount);
		$inv.find(".pc-clear").prop("disabled", total === 0);
		$inv.find(".pc-alloc").each(function () {
			const inv = invs[this.dataset.idx];
			$(this).toggleClass("pc-invalid", flt(inv.allocated_amount) > inv.outstanding_amount);
		});
		$inv.find(".pc-alloc-summary").html(`
			<div class="pc-row-between pc-strong">
				<span>${esc(__("Total Allocated:"))}</span>
				<span class="${total > amount ? "pc-text-red" : "pc-text-blue"}">${money(total)}</span>
			</div>
			${
				amount > 0 && total > 0
					? `<div class="pc-row-between pc-xs"><span class="pc-stat-label">${esc(
							__("Unallocated:")
					  )}</span><span>${money(amount - total)}</span></div>`
					: ""
			}
			${
				total > amount
					? `<div class="pc-xs pc-text-red">${esc(
							__("Allocated amount exceeds payment amount")
					  )}</div>`
					: ""
			}
			${
				over.length
					? `<div class="pc-xs pc-text-red">${esc(
							__("Allocated amount exceeds outstanding for {0}", [
								over.map((i) => i.voucher_no).join(", "),
							])
					  )}</div>`
					: ""
			}`);

		d.fields_dict.balance_error.$wrapper.html(
			amount > balance
				? alert_box(
						"red",
						"circle-x",
						__("Insufficient Balance"),
						__("Payment amount exceeds available balance. Available: {0}", [
							money(balance),
						])
				  )
				: ""
		);

		set_valid(
			d,
			supplier &&
				amount > 0 &&
				amount <= balance &&
				d.get_value("posting_date") &&
				(!d.get_value("reference_no") || d.get_value("reference_date")) &&
				!over.length &&
				total <= amount
		);
	};

	// Supplier card + invoice list; allocation-dependent bits are refreshed by render().
	const render_supplier = () => {
		const show = details || loading;
		d.fields_dict.supplier_card.$wrapper.html(
			show
				? `<div class="pc-alert pc-alert-blue"><div class="pc-grow">
					<div class="pc-box-title">${icon("user")} ${esc(__("Supplier Details"))}</div>
					${
						loading
							? spinner(__("Loading supplier details..."))
							: `<div class="pc-grid pc-grid-3">
								<div class="pc-tile-white">${stat(__("Name:"), esc(details.supplier_name))}</div>
								<div class="pc-tile-white">${stat(__("Currency:"), esc(details.default_currency))}</div>
								<div class="pc-tile-white">${stat(
									__("Payable Account:"),
									esc(details.payable_account),
									"pc-break"
								)}</div>
							</div>`
					}
				</div></div>`
				: ""
		);

		const invs = invoices();
		let body = "";
		if (loading) body = spinner(__("Loading outstanding invoices..."));
		else if (invs.length)
			body = `<div class="pc-row-between pc-mb">
					<label class="pc-inline"><input type="checkbox" class="pc-select-all"><span class="pc-xs pc-selected-count"></span></label>
					<div class="pc-actions">
						<button class="btn btn-default btn-xs pc-auto">${icon("zap", "xs")} ${esc(
				__("Auto-Allocate")
			)}</button>
						<button class="btn btn-default btn-xs pc-clear">${esc(__("Clear"))}</button>
					</div>
				</div>
				<div class="pc-invoice-list">${invs
					.map(
						(inv, idx) => `<div class="pc-invoice-row ${
							inv.selected ? "selected" : ""
						}">
						<input type="checkbox" class="pc-inv-check" data-idx="${idx}" ${inv.selected ? "checked" : ""}>
						<div class="pc-invoice-info" data-idx="${idx}">
							<div class="pc-invoice-no">${esc(inv.voucher_no)}</div>
							<div class="pc-xs pc-text-gray">${esc(inv.voucher_type)} • ${esc(
							__("Due: {0}", [fmt_date(inv.due_date)])
						)}</div>
						</div>
						<div class="pc-invoice-amt">
							<div class="pc-strong">${money(inv.outstanding_amount)}</div>
							<div class="pc-xs pc-text-gray">${esc(__("of {0}", [money(inv.invoice_amount)]))}</div>
						</div>
						<input type="number" class="form-control input-xs pc-alloc" data-idx="${idx}" min="0" step="0.01"
							placeholder="0" value="${flt(inv.allocated_amount) || ""}" ${inv.selected ? "" : "disabled"}>
					</div>`
					)
					.join("")}</div>
				<div class="pc-divider-top pc-alloc-summary"></div>`;
		else body = empty_state("file-x", __("No outstanding invoices found for this supplier."));

		d.fields_dict.invoices.$wrapper.html(
			show
				? `<div class="pc-card"><div class="pc-box-title">${icon("file-text")} ${esc(
						__("Outstanding Invoices")
				  )}</div>${body}</div>`
				: ""
		);
		render();
	};

	const load_supplier = async () => {
		const supplier = d?.get_value("supplier") || null;
		if (supplier === requested) return;
		requested = supplier;
		details = null;
		loading = !!(supplier && db.company);
		render_supplier();
		if (!loading) return d.set_value("supplier_name", "");
		let r = null;
		try {
			r = await call("get_supplier_details", { supplier, company: db.company });
		} catch (e) {
			// frappe already showed the error; leave details empty like hoteli
		}
		if (supplier !== requested) return; // a newer supplier was picked meanwhile
		for (const inv of r?.outstanding_invoices || []) inv.selected = false;
		details = r;
		loading = false;
		d.set_value("supplier_name", r?.supplier_name || "");
		render_supplier();
	};

	d = make_dialog({
		title: __("Pay Supplier"),
		size: "extra-large",
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "status",
				options:
					balance < LOW_BALANCE
						? alert_box(
								"amber",
								"triangle-alert",
								__("Low Petty Cash Balance"),
								__("Current balance: {0}. Consider replenishing petty cash.", [
									money(balance),
								])
						  )
						: alert_box(
								"green",
								"circle-check",
								__("Petty Cash Available"),
								__("Current balance: {0}", [money(balance)])
						  ),
			},
			{ fieldtype: "HTML", fieldname: "summary" },
			{ fieldtype: "HTML", fieldname: "invoices" },
			{ fieldtype: "Section Break" },
			{
				fieldtype: "Link",
				fieldname: "supplier",
				label: __("Supplier"),
				options: "Supplier",
				reqd: 1,
				placeholder: __("Search supplier..."),
				get_query: () => ({ filters: { disabled: 0 } }),
				onchange: () => load_supplier(),
			},
			{
				fieldtype: "Data",
				fieldname: "supplier_name",
				label: __("Supplier Name"),
				read_only: 1,
				depends_on: "eval:doc.supplier_name",
			},
			{ fieldtype: "HTML", fieldname: "supplier_card" },
			{
				fieldtype: "Date",
				fieldname: "posting_date",
				label: __("Posting Date"),
				reqd: 1,
				default: frappe.datetime.get_today(),
				onchange: render,
			},
			{
				fieldtype: "Link",
				fieldname: "mode_of_payment",
				label: __("Mode of Payment"),
				options: "Mode of Payment",
				default: "Cash",
				placeholder: __("Select payment mode..."),
				get_query: () => ({ filters: { enabled: 1 } }),
				onchange: render,
			},
			{
				fieldtype: "Data",
				fieldname: "reference_no",
				label: __("Reference No"),
				placeholder: __("Receipt/Invoice/Voucher number"),
				onchange: render,
			},
			{ fieldtype: "Column Break" },
			{
				fieldtype: "Currency",
				fieldname: "amount",
				label: __("Payment Amount"),
				reqd: 1,
				onchange: render,
			},
			{
				fieldtype: "Date",
				fieldname: "reference_date",
				label: __("Reference Date"),
				default: frappe.datetime.get_today(),
				depends_on: "eval:doc.reference_no",
				onchange: render,
			},
			{
				fieldtype: "Small Text",
				fieldname: "remarks",
				label: __("Remarks"),
				placeholder: __("Brief description of payment purpose"),
			},
			{ fieldtype: "Section Break" },
			{ fieldtype: "HTML", fieldname: "balance_error" },
			{
				fieldtype: "HTML",
				fieldname: "process",
				options: `<div class="pc-divider-top">
					<div class="pc-box-title">${esc(__("Payment Process"))}</div>
					<div class="pc-alert pc-alert-blue"><div class="pc-grow">
						<div class="pc-grid pc-grid-3">
							${stat(__("Document Type:"), esc(__("Payment Entry")))}
							${stat(__("Payment Type:"), esc(__("Pay")))}
							${stat(__("Party Type:"), esc(__("Supplier")))}
						</div>
						<div class="pc-xs pc-mt">${esc(
							__(
								"This will create an ERPNext Payment Entry document and debit the petty cash account."
							)
						)}</div>
					</div></div>
				</div>`,
			},
		],
		primary_action_label: __("Create Payment Entry"),
		primary_action: (v) =>
			submit(
				d,
				ctx,
				() =>
					call("pay_supplier_with_references", {
						supplier: v.supplier,
						amount: v.amount,
						mode_of_payment: v.mode_of_payment || "Cash",
						posting_date: v.posting_date,
						reference_no: v.reference_no,
						reference_date: v.reference_no ? v.reference_date : null,
						remarks: v.remarks,
						references: invoices().filter((i) => flt(i.allocated_amount) > 0),
					}),
				(r) => __("Payment Entry {0} created for {1}", [r.payment_entry, r.supplier_name])
			),
	});

	const $inv = d.fields_dict.invoices.$wrapper;
	const inv_at = (el) => invoices()[el.dataset.idx];
	$inv.on("change", ".pc-select-all", function () {
		for (const inv of invoices()) {
			inv.selected = this.checked;
			if (!this.checked) inv.allocated_amount = 0;
		}
		render_supplier();
	});
	$inv.on("change", ".pc-inv-check", function () {
		const inv = inv_at(this);
		inv.selected = this.checked;
		if (!this.checked) inv.allocated_amount = 0;
		render_supplier();
	});
	$inv.on("input", ".pc-alloc", function () {
		inv_at(this).allocated_amount = flt(this.value);
		render();
	});
	$inv.on("click", ".pc-auto", () => {
		let remaining = flt(d.get_value("amount"));
		for (const inv of invoices()) {
			const allocate = inv.selected ? Math.min(inv.outstanding_amount, remaining) : 0;
			inv.allocated_amount = allocate > 0 ? allocate : 0;
			remaining -= allocate;
		}
		render_supplier();
	});
	$inv.on("click", ".pc-clear", () => {
		for (const inv of invoices()) {
			inv.allocated_amount = 0;
			inv.selected = false;
		}
		render_supplier();
	});
	$inv.on("click", ".pc-invoice-info", function () {
		const inv = inv_at(this);
		if (inv.voucher_type === "Purchase Invoice") open_invoice_detail_dialog(inv.voucher_no);
	});

	render();
	d.show();
}

export function open_replenish_dialog(ctx) {
	const db = ctx.dashboard;
	const balance = flt(db.current_balance);
	const imprest = flt(db.imprest_amount);
	const suggested = flt(db.replenishment_amount) || Math.max(0, imprest - balance);
	let d;

	const render = () => {
		if (!d) return;
		const amount = flt(d.get_value("amount"));
		d.fields_dict.preview.$wrapper.html(
			amount > 0
				? `<div class="pc-alert pc-alert-green"><div>
					<div class="pc-stat-label">${esc(__("After Replenishment"))}</div>
					<div class="pc-value-xl">${money(balance + amount)}</div>
				</div></div>`
				: ""
		);
		set_valid(d, amount > 0 && d.get_value("bank_account") && d.get_value("posting_date"));
	};

	d = make_dialog({
		title: __("Replenish Petty Cash"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "status",
				options: `<div class="pc-grid pc-grid-2">
					<div class="pc-tile"><div class="pc-stat-label">${esc(
						__("Current Balance")
					)}</div><div class="pc-value-xl">${money(balance)}</div></div>
					<div class="pc-tile"><div class="pc-stat-label">${esc(
						__("Imprest Amount")
					)}</div><div class="pc-value-xl">${money(imprest)}</div></div>
				</div>
				<div class="pc-alert pc-alert-blue"><div class="pc-grow">
					<div class="pc-row-between">
						<div>
							<div class="pc-stat-label">${esc(__("Suggested Replenishment"))}</div>
							<div class="pc-value-2xl">${money(suggested)}</div>
						</div>
						<button class="btn btn-default btn-sm pc-use-suggested">${esc(__("Use Suggested"))}</button>
					</div>
					<div class="pc-xs pc-mt">${esc(__("This will restore the balance to the imprest level"))}</div>
				</div></div>`,
			},
			{
				fieldtype: "Currency",
				fieldname: "amount",
				label: __("Replenishment Amount"),
				reqd: 1,
				default: suggested,
				onchange: render,
			},
			{
				fieldtype: "Date",
				fieldname: "posting_date",
				label: __("Replenishment Date"),
				reqd: 1,
				default: frappe.datetime.get_today(),
				onchange: render,
			},
			{
				fieldtype: "Link",
				fieldname: "bank_account",
				label: __("Bank Account"),
				options: "Account",
				reqd: 1,
				default: db.bank_account,
				get_query: () => ({ filters: { company: db.company, is_group: 0 } }),
				onchange: render,
			},
			{
				fieldtype: "Data",
				fieldname: "reference_no",
				label: __("Reference Number"),
				placeholder: __("Withdrawal reference"),
			},
			{ fieldtype: "HTML", fieldname: "preview" },
		],
		primary_action_label: __("Replenish Cash"),
		primary_action: (v) =>
			submit(
				d,
				ctx,
				() =>
					call("replenish_petty_cash", {
						amount: v.amount,
						bank_account: v.bank_account,
						posting_date: v.posting_date,
						reference_no: v.reference_no,
					}),
				(r) => __("Petty cash replenished: {0}", [r.journal_entry])
			),
	});
	d.fields_dict.status.$wrapper.on("click", ".pc-use-suggested", () =>
		d.set_value("amount", suggested)
	);
	render();
	d.show();
}

const INVOICE_STATUS_COLOR = {
	Paid: "green",
	Overdue: "red",
	Unpaid: "orange",
	"Partly Paid": "blue",
};

function invoice_html(inv) {
	const overdue =
		inv.due_date && inv.due_date < frappe.datetime.get_today() && inv.outstanding_amount > 0;
	const th = (label, right) => `<th class="${right ? "text-right" : ""}">${esc(label)}</th>`;
	const items = inv.items || [];
	return `<div class="pc-stack">
		<div class="pc-text-gray">${icon("user")} ${esc(inv.supplier_name || inv.supplier)}</div>
		<div class="pc-grid pc-grid-4">
			<div class="pc-tile">${stat(
				__("Status"),
				badge(__(inv.status), INVOICE_STATUS_COLOR[inv.status] || "gray")
			)}</div>
			<div class="pc-tile">${stat(__("Posting Date"), fmt_date(inv.posting_date))}</div>
			<div class="pc-tile">${stat(
				__("Due Date"),
				`${fmt_date(inv.due_date)}${
					overdue ? ` <span class="pc-xs">${esc(__("(Overdue)"))}</span>` : ""
				}`,
				overdue ? "pc-text-red" : ""
			)}</div>
			<div class="pc-tile">${stat(__("Bill No"), esc(inv.bill_no || "-"))}</div>
		</div>

		<div class="pc-alert pc-alert-blue"><div class="pc-grow">
			<div class="pc-grid pc-grid-4">
				${stat(__("Net Total:"), money(inv.net_total))}
				${stat(__("Tax:"), money(inv.total_taxes_and_charges))}
				${stat(__("Grand Total:"), money(inv.grand_total))}
				${stat(
					__("Outstanding:"),
					money(inv.outstanding_amount),
					inv.outstanding_amount > 0 ? "pc-text-red" : "pc-text-green"
				)}
			</div>
			${
				inv.paid_amount > 0
					? `<div class="pc-divider-top pc-row-between"><span>${esc(
							__("Amount Paid:")
					  )}</span><span class="pc-strong pc-text-green">${money(
							inv.paid_amount
					  )}</span></div>`
					: ""
			}
		</div></div>

		<div>
			<div class="pc-box-title">${icon("package")} ${esc(__("Items ({0})", [items.length]))}</div>
			<div class="pc-table-box"><table class="pc-list">
				<thead><tr>${th("#")}${th(__("Item"))}${th(__("Qty"), 1)}${th(__("Rate"), 1)}${th(
		__("Amount"),
		1
	)}</tr></thead>
				<tbody>${items
					.map((item, idx) => {
						const name = item.item_name || item.item_code;
						const desc = strip_html(item.description || "");
						return `<tr>
							<td class="pc-text-gray">${idx + 1}</td>
							<td><div class="pc-strong">${esc(name)}</div>${
							desc && desc !== item.item_name
								? `<div class="pc-xs pc-text-gray pc-truncate">${esc(desc)}</div>`
								: ""
						}</td>
							<td class="text-right">${esc(`${item.qty} ${item.uom || ""}`)}</td>
							<td class="text-right">${money(item.rate)}</td>
							<td class="text-right pc-strong">${money(item.amount)}</td>
						</tr>`;
					})
					.join("")}</tbody>
			</table></div>
		</div>

		${
			inv.taxes?.length
				? `<div>
				<div class="pc-box-title">${icon("percent")} ${esc(__("Taxes & Charges"))}</div>
				<div class="pc-table-box"><table class="pc-list">
					<thead><tr>${th(__("Description"))}${th(__("Rate"), 1)}${th(__("Amount"), 1)}</tr></thead>
					<tbody>${inv.taxes
						.map(
							(tax) => `<tr>
							<td>${esc(tax.description || tax.account_head)}</td>
							<td class="text-right">${esc(flt(tax.rate))}%</td>
							<td class="text-right pc-strong">${money(tax.tax_amount)}</td>
						</tr>`
						)
						.join("")}</tbody>
				</table></div>
			</div>`
				: ""
		}

		${
			inv.payments?.length
				? `<div>
				<div class="pc-box-title">${icon("credit-card")} ${esc(__("Payment History"))}</div>
				<div class="pc-stack-sm">${inv.payments
					.map(
						(
							p
						) => `<div class="pc-alert pc-alert-green"><div class="pc-grow pc-row-between">
							<div>
								<div class="pc-strong">${voucher_link("Payment Entry", p.payment_entry)}</div>
								<div class="pc-xs">${fmt_date(p.posting_date)} • ${esc(p.mode_of_payment || __("N/A"))}</div>
							</div>
							<div class="pc-strong">${money(p.allocated_amount)}</div>
						</div></div>`
					)
					.join("")}</div>
			</div>`
				: ""
		}

		${
			inv.remarks
				? `<div class="pc-tile"><div class="pc-stat-label">${esc(
						__("Remarks")
				  )}</div><div>${esc(inv.remarks)}</div></div>`
				: ""
		}
	</div>`;
}

export function open_invoice_detail_dialog(invoice_name) {
	const d = make_dialog({
		title: __("Invoice: {0}", [invoice_name]),
		size: "large",
		fields: [{ fieldtype: "HTML", fieldname: "body" }],
		secondary_action_label: __("Close"),
		primary_action_label: __("Open in Desk"),
		primary_action: () => {
			d.hide();
			frappe.set_route("Form", "Purchase Invoice", invoice_name);
		},
	});
	const $body = d.fields_dict.body.$wrapper.html(spinner(__("Loading invoice details...")));
	d.show();
	call("get_purchase_invoice_details", { invoice_name })
		.then((inv) => $body.html(invoice_html(inv)))
		.catch((e) =>
			$body.html(
				alert_box("red", "circle-alert", e?.message || __("Failed to load invoice"))
			)
		);
}

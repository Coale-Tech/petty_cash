// Journal Entry / Payment / Replenishment / Settings tabs of the petty-cash Desk page.
// Mirrors hoteli components/petty-cash/{JournalEntry,PaymentEntry,Replenishment,Settings}Tab.vue.
import {
	call,
	money,
	fmt_date,
	esc,
	icon,
	badge,
	voucher_link,
	docstatus_badge,
	pager_html,
	bind_pager,
	empty_state,
	make_control,
	set_float,
} from "./utils";

const PAGE_SIZE = 10;
const today = () => frappe.datetime.get_today();

const VOUCHER_TYPES = [
	"Journal Entry",
	"Inter Company Journal Entry",
	"Bank Entry",
	"Cash Entry",
	"Credit Card Entry",
	"Debit Note",
	"Credit Note",
	"Contra Entry",
	"Excise Entry",
	"Write Off Entry",
	"Opening Entry",
	"Depreciation Entry",
	"Exchange Rate Revaluation",
	"Exchange Gain Or Loss",
	"Deferred Revenue",
	"Deferred Expense",
];
const VOUCHER_COLORS = {
	"Journal Entry": "blue",
	"Cash Entry": "green",
	"Bank Entry": "purple",
	"Credit Card Entry": "orange",
	"Debit Note": "red",
	"Credit Note": "cyan",
	"Contra Entry": "gray",
	"Write Off Entry": "red",
	"Opening Entry": "amber",
	"Depreciation Entry": "gray",
};
const PARTY_TYPES = ["", "Customer", "Supplier", "Employee", "Shareholder"];
const REFERENCE_TYPES = [
	"",
	"Sales Invoice",
	"Purchase Invoice",
	"Sales Order",
	"Purchase Order",
	"Journal Entry",
	"Payment Entry",
];
const REQUEST_COLORS = { Draft: "orange", Completed: "green", Cancelled: "red" };
const CATEGORY_COLORS = {
	Transport: "blue",
	"Office Supplies": "purple",
	"Cleaning Supplies": "cyan",
	Maintenance: "orange",
	"Food & Beverage": "green",
	Utilities: "amber",
	Miscellaneous: "gray",
};
const TEMPLATE_FIELDS = [
	"template_name",
	"expense_category",
	"description",
	"debit_account",
	"credit_account",
	"journal_entry_template",
];
const NUMERIC_SETTINGS = new Set([
	"imprest_amount",
	"replenishment_trigger",
	"require_receipt_reference",
	"allow_cashier_settings_view",
]);

// ---------- shared helpers ----------

const loading_html = (msg = __("Loading...")) =>
	`<div class="pc-loading"><span class="pc-spin">${icon("loader")}</span>${esc(msg)}</div>`;

const th = (ic, label, right) =>
	`<th${right ? ' class="text-right"' : ""}>${ic ? icon(ic) : ""}${esc(label)}</th>`;

// Desk controls laid out in a responsive grid; returns {fieldname: control}. `null` = empty cell.
function grid($parent, cols, dfs) {
	const $grid = $(`<div class="pc-grid pc-grid-${cols}"></div>`).appendTo($parent);
	const controls = {};
	for (const df of dfs) {
		const $cell = $(`<div class="pc-span-${(df && df.span) || 1}"></div>`).appendTo($grid);
		if (df) controls[df.fieldname] = make_control($cell, df, df.default);
	}
	return controls;
}

const values = (controls) =>
	Object.fromEntries(Object.entries(controls).map(([k, c]) => [k, c.get_value() ?? ""]));

function check_reqd(...maps) {
	const missing = maps
		.flatMap((m) => Object.values(m))
		.filter((c) => c.df.reqd && !c.get_value())
		.map((c) => c.df.label);
	if (missing.length) frappe.throw(__("Missing required fields: {0}", [missing.join(", ")]));
}

// Party/Reference: target link is disabled until its type select has a value.
function link_dynamic(type, target) {
	const sync = () => target.$input.prop("disabled", !type.get_value());
	type.df.onchange = () => {
		target.set_value("");
		sync();
	};
	sync();
}

// Header with the "New …" / "Cancel" toggle and a lazily built inline form card.
function tab_with_form($c, title, new_label, build) {
	$c.empty();
	const $btn = $(`<button class="btn btn-default btn-sm"></button>`);
	$(`<div class="pc-tab-head"><div class="pc-tab-title">${esc(title)}</div></div>`)
		.append($btn)
		.appendTo($c);
	const $form = $(`<div class="pc-card pc-inline-form"></div>`).hide().appendTo($c);
	let open = false;
	let built = false;
	const toggle = (state) => {
		open = state;
		if (open && !built) {
			build($form, () => toggle(false));
			built = true;
		}
		$form.toggle(open);
		$btn.html(open ? `${icon("x")} ${__("Cancel")}` : `${icon("plus")} ${esc(new_label)}`);
	};
	$btn.on("click", () => toggle(!open));
	toggle(false);
}

function form_actions($form, label, submit, close) {
	const $bar = $(`<div class="pc-form-actions">
		<button class="btn btn-primary btn-sm">${esc(label)}</button>
		<button class="btn btn-default btn-sm">${__("Cancel")}</button>
	</div>`).appendTo($form);
	const $go = $bar.find(".btn-primary");
	$go.on("click", async () => {
		$go.prop("disabled", true);
		try {
			await submit();
		} catch (e) {
			console.error(e); // frappe already showed the message
		} finally {
			$go.prop("disabled", false);
		}
	});
	$bar.find(".btn-default").on("click", close);
}

function created(ctx, message) {
	frappe.show_alert({ message, indicator: "green" });
	return ctx.refresh();
}

// "Recent …" card: header count, icon table, View button, pager, empty state.
function list_card($parent, { title, doctype, load, columns, cells, empty }) {
	const $card = $(`<div class="pc-card">${loading_html()}</div>`).appendTo($parent);
	let rows = [];
	let page = 1;
	const draw = () => {
		const n = rows.length;
		const from = (page - 1) * PAGE_SIZE;
		$card.html(`
			<div class="pc-list-head">
				<div class="pc-list-title">${esc(title)} (${n})</div>
				${
					n
						? `<span class="pc-muted">${__("Showing {0} to {1} of {2}", [
								from + 1,
								Math.min(from + PAGE_SIZE, n),
								n,
						  ])}</span>`
						: ""
				}
			</div>
			${
				n
					? `<div class="pc-list-wrap"><table class="pc-list">
						<thead><tr>${columns
							.map(([ic, label, right]) => th(ic, label, right))
							.join("")}<th></th></tr></thead>
						<tbody>${rows
							.slice(from, from + PAGE_SIZE)
							.map(
								(r) => `<tr class="pc-clickable" data-name="${esc(r.name)}">
									${cells(r)
										.map(
											(html, i) =>
												`<td${
													columns[i][2] ? ' class="text-right"' : ""
												}>${html}</td>`
										)
										.join("")}
									<td class="text-right"><button class="btn btn-xs btn-default">${icon("eye")} ${__(
									"View"
								)}</button></td>
								</tr>`
							)
							.join("")}</tbody>
					</table></div>
					${pager_html(page, Math.ceil(n / PAGE_SIZE), n, PAGE_SIZE)}`
					: empty_state("inbox", ...empty)
			}`);
		bind_pager($card, (p) => {
			page = p;
			draw();
		});
		$card.find("tbody tr").on("click", function (e) {
			if (!$(e.target).closest("a").length)
				frappe.set_route("Form", doctype, this.dataset.name);
		});
	};
	load().then(
		(r) => {
			rows = (r && r.data) || [];
			draw();
		},
		() => $card.html(empty_state("circle-alert", __("Could not load data")))
	);
}

// ---------- Journal Entries ----------

// One Journal Entry Account row (debit = expense side, credit = petty cash side).
function entry_block($parent, side, company, on_amount, cost_center, petty) {
	const debit = side === "debit";
	const $block = $(
		`<div class="pc-entry-block pc-entry-${side}">${
			debit ? `<div class="pc-entry-title">${__("Debit Account (Expense)")}</div>` : ""
		}</div>`
	).appendTo($parent);
	const by_company = (extra) => () => ({ filters: { company: company(), ...extra } });
	const c = grid($block, 4, [
		{
			fieldname: "account",
			fieldtype: "Link",
			options: "Account",
			label: debit ? __("Account") : __("Credit Account (Petty Cash)"),
			placeholder: debit
				? __("Select expense account")
				: petty
				? __("Auto-set from settings")
				: __("Select petty cash account"),
			reqd: 1,
			span: 2,
			read_only: !debit && petty ? 1 : 0,
			default: debit ? undefined : petty,
			get_query: by_company({ is_group: 0 }),
		},
		{
			fieldname: "cost_center",
			fieldtype: "Link",
			options: "Cost Center",
			label: __("Cost Center"),
			default: cost_center,
			get_query: by_company({ is_group: 0 }),
		},
		{
			fieldname: "amount",
			fieldtype: "Currency",
			label: debit ? __("Debit Amount") : __("Amount"),
			reqd: 1,
			onchange: on_amount,
		},
	]);
	Object.assign(
		c,
		grid($block, 2, [
			{
				fieldname: "party_type",
				fieldtype: "Select",
				label: __("Party Type"),
				options: PARTY_TYPES.join("\n"),
			},
			{
				fieldname: "party",
				fieldtype: "Dynamic Link",
				label: __("Party"),
				get_options: () => c.party_type.get_value(),
			},
		]),
		grid($block, 4, [
			{
				fieldname: "project",
				fieldtype: "Link",
				options: "Project",
				label: __("Project"),
				get_query: by_company(),
			},
			{
				fieldname: "reference_type",
				fieldtype: "Select",
				label: __("Reference Type"),
				options: REFERENCE_TYPES.join("\n"),
			},
			{
				fieldname: "reference_name",
				fieldtype: "Dynamic Link",
				label: __("Reference Name"),
				get_options: () => c.reference_type.get_value(),
				get_query: by_company(),
			},
			{
				fieldname: "user_remark",
				fieldtype: "Data",
				label: __("Remark"),
				placeholder: __("Account specific remark"),
			},
		])
	);
	link_dynamic(c.party_type, c.party);
	link_dynamic(c.reference_type, c.reference_name);
	return c;
}

function entry_row(controls, debit) {
	const { amount, ...row } = values(controls);
	return {
		...row,
		debit_in_account_currency: debit ? flt(amount) : 0,
		credit_in_account_currency: debit ? 0 : flt(amount),
	};
}

export function render_journal_entry_tab($c, ctx) {
	tab_with_form($c, __("Create Journal Entry"), __("New Journal Entry"), ($form, close) => {
		const petty = ctx.dashboard?.petty_cash_account;
		const head = grid($form, 2, [
			{
				fieldname: "company",
				fieldtype: "Link",
				options: "Company",
				label: __("Company"),
				reqd: 1,
				default: ctx.dashboard?.company,
			},
			{
				fieldname: "posting_date",
				fieldtype: "Date",
				label: __("Posting Date"),
				reqd: 1,
				default: today(),
			},
			{ fieldname: "title", fieldtype: "Data", label: __("Title"), reqd: 1 },
			{
				fieldname: "voucher_type",
				fieldtype: "Select",
				label: __("Entry Type"),
				options: VOUCHER_TYPES.join("\n"),
				reqd: 1,
				default: "Journal Entry",
			},
			{
				fieldname: "finance_book",
				fieldtype: "Link",
				options: "Finance Book",
				label: __("Finance Book"),
			},
			{
				fieldname: "user_remark",
				fieldtype: "Small Text",
				label: __("User Remark"),
				reqd: 1,
			},
		]);
		// company Link validates async; an empty filter would make Link validation clear the petty cash default
		const company = () => head.company.get_value() || ctx.dashboard?.company;

		$form.append(`<div class="pc-accounts-head">
			<div class="pc-accounts-title">${__("Accounts")}</div>
			<div class="pc-legend">
				<span><i class="pc-swatch pc-swatch-debit"></i>${__("Debit (Expense)")}</span>
				<span><i class="pc-swatch pc-swatch-credit"></i>${__("Credit (Petty Cash)")}</span>
				${
					petty
						? ""
						: `<span class="pc-legend-warn">${icon("triangle-alert")}${__(
								"Petty Cash account not configured"
						  )}</span>`
				}
			</div>
		</div>`);

		let debit, credit;
		const $balance = $(`<div></div>`);
		const update_balance = () => {
			const dr = flt(debit?.amount.get_value());
			const cr = flt(credit?.amount.get_value());
			const [cls, ic, msg] =
				!dr && !cr
					? ["empty", "info", __("Enter amounts")]
					: dr === cr
					? ["balanced", "circle-check", __("Balanced")]
					: [
							"unbalanced",
							"circle-alert",
							__("Unbalanced: {0} difference", [money(Math.abs(dr - cr))]),
					  ];
			$balance
				.attr("class", `pc-balance pc-balance-${cls}`)
				.html(`${icon(ic)}<span>${esc(msg)}</span>`);
		};
		// Credit mirrors the debit amount (single expense line against petty cash).
		// Both lines default to the float's cost centre.
		const cc = ctx.dashboard?.cost_center;
		debit = entry_block(
			$form,
			"debit",
			company,
			() => {
				credit?.amount.set_value(debit.amount.get_value());
				update_balance();
			},
			cc
		);
		credit = entry_block($form, "credit", company, update_balance, cc, petty);
		$balance.appendTo($form);
		update_balance();

		form_actions(
			$form,
			__("Create Journal Entry"),
			async () => {
				check_reqd(head, debit, credit);
				const dr = entry_row(debit, true);
				const cr = entry_row(credit, false);
				if (dr.account === cr.account)
					frappe.throw(__("Debit and credit accounts cannot be the same"));
				if (dr.debit_in_account_currency <= 0)
					frappe.throw(__("Debit amount must be greater than 0"));
				if (dr.debit_in_account_currency !== cr.credit_in_account_currency)
					frappe.throw(__("Debit and credit amounts must be equal"));
				const r = await call("create_journal_entry", {
					data: { ...values(head), accounts: [dr, cr] },
				});
				await created(ctx, __("Journal Entry {0} created", [r.data.name]));
			},
			close
		);
	});

	list_card($c, {
		title: __("Recent Journal Entries"),
		doctype: "Journal Entry",
		load: () => call("get_recent_journal_entries"),
		empty: [__("No journal entries found"), __("Create a journal entry to see it here.")],
		columns: [
			["hash", __("Name")],
			["calendar", __("Date")],
			["file-text", __("Title")],
			["tag", __("Type")],
			["arrow-down-left", __("Total Debit"), true],
			["circle-check", __("Status")],
		],
		cells: (r) => [
			voucher_link("Journal Entry", r.name),
			esc(fmt_date(r.posting_date)),
			esc(r.title || r.user_remark || "-"),
			badge(__(r.voucher_type || "Journal Entry"), VOUCHER_COLORS[r.voucher_type] || "blue"),
			money(r.total_debit),
			docstatus_badge(r.docstatus),
		],
	});
}

// ---------- Payment Entries ----------

export function render_payment_entry_tab($c, ctx) {
	tab_with_form($c, __("Create Payment Entry"), __("New Payment"), ($form, close) => {
		// Backend pays suppliers only, so Party Type is fixed to Supplier.
		const f = grid($form, 2, [
			{
				fieldname: "posting_date",
				fieldtype: "Date",
				label: __("Posting Date"),
				reqd: 1,
				default: today(),
			},
			{
				fieldname: "party_type",
				fieldtype: "Select",
				label: __("Party Type"),
				options: "Supplier",
				reqd: 1,
				default: "Supplier",
			},
			{
				fieldname: "supplier",
				fieldtype: "Link",
				options: "Supplier",
				label: __("Party"),
				reqd: 1,
			},
			{ fieldname: "amount", fieldtype: "Currency", label: __("Amount"), reqd: 1 },
			{
				fieldname: "mode_of_payment",
				fieldtype: "Link",
				options: "Mode of Payment",
				label: __("Mode of Payment"),
				reqd: 1,
				default: "Cash",
			},
			{ fieldname: "reference_no", fieldtype: "Data", label: __("Reference No") },
			{ fieldname: "reference_date", fieldtype: "Date", label: __("Reference Date") },
			{ fieldname: "remarks", fieldtype: "Small Text", label: __("Remarks") },
		]);
		form_actions(
			$form,
			__("Create Payment Entry"),
			async () => {
				check_reqd(f);
				const { party_type, ...args } = values(f);
				const r = await call("pay_supplier_with_references", args);
				await created(ctx, __("Payment Entry {0} created", [r.payment_entry]));
			},
			close
		);
	});

	list_card($c, {
		title: __("Recent Payment Entries"),
		doctype: "Payment Entry",
		load: () => call("get_recent_payment_entries"),
		empty: [__("No payment entries found"), __("Create a payment entry to see it here.")],
		columns: [
			["calendar", __("Date")],
			["users", __("Party")],
			["dollar-sign", __("Amount"), true],
			["credit-card", __("Mode")],
			["circle-check", __("Status")],
		],
		cells: (r) => [
			esc(fmt_date(r.posting_date)),
			esc(r.party_name || r.party || "-"),
			money(r.paid_amount),
			esc(r.mode_of_payment || "-"),
			docstatus_badge(r.docstatus),
		],
	});
}

// ---------- Replenishment Requests ----------

export function render_replenishment_tab($c, ctx) {
	tab_with_form(
		$c,
		__("Petty Cash Replenishment Requests"),
		__("New Request"),
		($form, close) => {
			const petty = ctx.dashboard?.petty_cash_account;
			const f = grid($form, 2, [
				{
					fieldname: "posting_date",
					fieldtype: "Date",
					label: __("Posting Date"),
					reqd: 1,
					default: today(),
				},
				{
					fieldname: "petty_cash_account",
					fieldtype: "Link",
					options: "Account",
					label: __("Petty Cash Account"),
					reqd: 1,
					read_only: petty ? 1 : 0,
					default: petty,
					get_query: () => ({
						filters: { company: ctx.dashboard?.company, is_group: 0 },
					}),
				},
				{
					fieldname: "requested_amount",
					fieldtype: "Currency",
					label: __("Requested Amount"),
					reqd: 1,
					default: ctx.dashboard?.replenishment_amount,
				},
				{
					fieldname: "reason",
					fieldtype: "Small Text",
					label: __("Reason for Replenishment"),
				},
			]);
			form_actions(
				$form,
				__("Create Request"),
				async () => {
					check_reqd(f);
					await call("create_replenishment_request", { data: values(f) });
					await created(ctx, __("Replenishment request created"));
				},
				close
			);
		}
	);

	list_card($c, {
		title: __("Recent Requests"),
		doctype: "Journal Entry",
		load: () => call("get_replenishment_requests"),
		empty: [
			__("No replenishment requests found"),
			__("Create a replenishment request to see it here."),
		],
		columns: [
			["hash", __("Request ID")],
			["calendar", __("Date")],
			["dollar-sign", __("Balance"), true],
			["arrow-up", __("Requested"), true],
			["circle-check", __("Status")],
		],
		cells: (r) => [
			voucher_link("Journal Entry", r.name),
			esc(fmt_date(r.posting_date)),
			money(r.current_balance),
			money(r.requested_amount),
			badge(__(r.status || "Draft"), REQUEST_COLORS[r.status] || "gray"),
		],
	});
}

// ---------- Settings ----------

export function render_settings_tab($c, ctx) {
	if (!ctx.access?.can_view_settings) {
		$c.html(
			`<div class="pc-card">${empty_state(
				"lock",
				__("Access Denied"),
				__("You don't have permission to view petty cash settings.")
			)}</div>`
		);
		return;
	}
	$c.html(loading_html(__("Loading settings...")));
	call("get_petty_cash_settings").then(
		(s) => draw_settings($c, ctx, s),
		() =>
			$c.html(
				`<div class="pc-card">${empty_state(
					"circle-alert",
					__("Could not load data")
				)}</div>`
			)
	);
}

const norm_template = (t) =>
	Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f, (t && t[f]) || ""]));
// "5100 - Transport - PT" -> "5100 - Transport" (drop company abbr)
const short_account = (a) => (a ? a.replace(/ - [^-]+$/, "") : __("Not set"));

function draw_settings($c, ctx, s) {
	// No name = a new float; creating needs create rights, editing needs write on this float.
	const can = s.name ? ctx.access.can_manage_settings : ctx.access.can_create_float;
	let templates = (s.expense_templates || []).map(norm_template);
	let original, $save, $reset;
	const c = {};

	$c.empty();
	const $root = $(`<div class="pc-settings"></div>`).appendTo($c);

	if (!s.petty_cash_account) {
		$root.append(`<div class="pc-setup-guide">
			<div class="pc-setup-icon">${icon("compass", "md")}</div>
			<div>
				<div class="pc-setup-title">${__("Welcome to Petty Cash Management")}</div>
				<p>${__(
					"Let's set up your petty cash system in just a few steps. You'll need to configure accounts and set your imprest amount."
				)}</p>
				<div class="pc-setup-steps">${[
					__("Choose petty cash account"),
					__("Set imprest amount"),
					__("Configure expense templates"),
				]
					.map((t) => `<div>${icon("circle-check")}<span>${t}</span></div>`)
					.join("")}</div>
			</div>
		</div>`);
	}

	const section = (title, sub) =>
		$(`<div class="pc-section-card">
			<div class="pc-section-head"><div>
				<div class="pc-section-title">${esc(title)}</div>
				${sub ? `<div class="pc-section-sub">${esc(sub)}</div>` : ""}
			</div></div>
			<div class="pc-section-body"></div>
		</div>`).appendTo($root);
	const body = ($s) => $s.find(".pc-section-body");

	const state = (src) =>
		JSON.stringify([
			Object.keys(c).map((k) => (NUMERIC_SETTINGS.has(k) ? flt(src[k]) : src[k] || "")),
			templates,
		]);
	const dirty = () => {
		if ($save) $save.add($reset).prop("disabled", state(values(c)) === original);
	};
	const field = (df) => ({
		...df,
		default: s[df.fieldname],
		read_only: can ? 0 : 1,
		onchange: dirty,
	});
	const account_query = () => ({
		filters: { company: c.company?.get_value() || s.company, is_group: 0, disabled: 0 },
	});
	const account = (fieldname, label, description, reqd) =>
		field({
			fieldname,
			fieldtype: "Link",
			options: "Account",
			label,
			description,
			reqd,
			get_query: account_query,
		});

	Object.assign(
		c,
		grid(
			body(
				section(
					__("General Settings"),
					__("Cost centre this float belongs to and its imprest")
				)
			),
			2,
			[
				// The cost centre names the float, so both are fixed once it exists.
				{
					...field({
						fieldname: "company",
						fieldtype: "Link",
						options: "Company",
						label: __("Company"),
						placeholder: __("Select company..."),
						reqd: 1,
					}),
					read_only: s.name || !can ? 1 : 0,
				},
				{
					...field({
						fieldname: "cost_center",
						fieldtype: "Link",
						options: "Cost Center",
						label: __("Cost Center"),
						description: __("Each cost centre runs its own float"),
						reqd: 1,
						get_query: () => ({
							filters: { company: c.company?.get_value() || s.company, is_group: 0 },
						}),
					}),
					read_only: s.name || !can ? 1 : 0,
				},
				field({
					fieldname: "imprest_amount",
					fieldtype: "Currency",
					label: __("Imprest Amount"),
					description: __("Fixed amount to maintain in petty cash"),
				}),
				field({
					fieldname: "replenishment_trigger",
					fieldtype: "Currency",
					label: __("Replenishment Trigger"),
					description: __("Alert when balance falls below this"),
				}),
			]
		),
		grid(body(section(__("Account Settings"), __("Configure ledger accounts"))), 2, [
			account(
				"petty_cash_account",
				__("Petty Cash Account"),
				__("Cash account for petty cash (select any non-group account)"),
				1
			),
			account(
				"bank_account",
				__("Bank Account for Replenishment"),
				__("Bank account to withdraw from")
			),
			account(
				"default_expense_account",
				__("Default Expense Account"),
				__("Fallback expense account")
			),
		]),
		grid(body(section(__("Controls"), __("Cashier rules and settings access"))), 2, [
			field({
				fieldname: "require_receipt_reference",
				fieldtype: "Check",
				label: __("Require Receipt Reference"),
			}),
			field({
				fieldname: "allow_cashier_settings_view",
				fieldtype: "Check",
				label: __("Allow Cashiers to View Settings"),
				description: __("If unchecked, only Accounts Manager can access this tab"),
			}),
		])
	);
	original = state(s);

	// Expense templates
	const $tpl = section(
		__("Expense Templates"),
		__("Pre-configured expense types for quick cashier selection")
	);
	const $tools = $(
		`<div class="pc-tpl-tools"><span class="pc-muted pc-tpl-count"></span></div>`
	).appendTo($tpl.find(".pc-section-head"));
	const edit_template = (i) => {
		const is_new = i === undefined;
		const d = new frappe.ui.Dialog({
			title: is_new ? __("Add Expense Template") : __("Edit Expense Template"),
			size: "large",
			fields: [
				{
					fieldname: "template_name",
					fieldtype: "Data",
					label: __("Template Name"),
					placeholder: __("e.g., Transport"),
					reqd: 1,
				},
				{
					fieldname: "debit_account",
					fieldtype: "Link",
					options: "Account",
					label: __("Debit Account (Expense)"),
					reqd: 1,
					get_query: account_query,
				},
				{
					fieldname: "credit_account",
					fieldtype: "Link",
					options: "Account",
					label: __("Credit Account"),
					get_query: account_query,
				},
				{ fieldtype: "Column Break" },
				{
					fieldname: "expense_category",
					fieldtype: "Select",
					label: __("Category"),
					options: ["", ...Object.keys(CATEGORY_COLORS)].join("\n"),
				},
				{
					fieldname: "journal_entry_template",
					fieldtype: "Link",
					options: "Journal Entry Template",
					label: __("Journal Entry Template"),
					placeholder: __("Select template..."),
				},
				{ fieldtype: "Section Break" },
				{
					fieldname: "description",
					fieldtype: "Small Text",
					label: __("Description"),
					placeholder: __(
						"Brief description for cashiers (e.g., 'For taxi and bus fares')"
					),
				},
			],
			primary_action_label: is_new ? __("Add Template") : __("Save Changes"),
			primary_action(v) {
				if (is_new) templates.push(norm_template(v));
				else templates[i] = norm_template(v);
				d.hide();
				draw_templates();
				dirty();
			},
		});
		d.$wrapper.addClass("pc-dialog");
		if (!is_new) d.set_values(templates[i]);
		d.show();
	};
	if (can) {
		$(`<button class="btn btn-primary btn-sm">${icon("plus")} ${__("Add Template")}</button>`)
			.on("click", () => edit_template())
			.appendTo($tools);
	}
	const draw_templates = () => {
		const n = templates.length;
		$tpl.find(".pc-tpl-count").text(
			n ? (n === 1 ? __("1 template") : __("{0} templates", [n])) : ""
		);
		const $b = body($tpl);
		if (!n) {
			$b.html(`<div class="pc-tpl-empty">
				<div class="pc-tpl-empty-icon">${icon("file-text", "lg")}</div>
				<div class="pc-tpl-empty-title">${__("No Expense Templates")}</div>
				<p>${__(
					"Create templates for common expenses to help cashiers quickly record petty cash transactions."
				)}</p>
				${
					can
						? `<button class="btn btn-primary btn-sm">${icon("plus")} ${__(
								"Create First Template"
						  )}</button>`
						: ""
				}
			</div>`);
			$b.find("button").on("click", () => edit_template());
			return;
		}
		$b.html(`<div class="pc-list-wrap"><table class="pc-list">
			<thead><tr>
				${th("file-text", __("Template Name"))}
				${th("tag", __("Category"))}
				${th("book", __("Debit Account"))}
				${th("text-align-start", __("Description"))}
				${can ? th("ellipsis", __("Actions"), true) : ""}
			</tr></thead>
			<tbody>${templates
				.map(
					(t, i) => `<tr class="${can ? "pc-clickable" : ""}" data-idx="${i}">
						<td>${esc(t.template_name || __("Unnamed Template"))}</td>
						<td>${badge(
							t.expense_category ? __(t.expense_category) : __("Uncategorized"),
							CATEGORY_COLORS[t.expense_category] || "gray"
						)}</td>
						<td>${esc(short_account(t.debit_account))}</td>
						<td class="pc-muted">${esc(t.description || __("No description"))}</td>
						${
							can
								? `<td class="text-right pc-nowrap">
									<button class="pc-icon-btn" title="${__("Edit")}">${icon("pencil")}</button>
									<button class="pc-icon-btn pc-danger pc-tpl-delete" title="${__("Delete")}">${icon(
										"trash-2"
								  )}</button>
								</td>`
								: ""
						}
					</tr>`
				)
				.join("")}</tbody>
		</table></div>`);
		if (!can) return;
		$b.find("tbody tr").on("click", function (e) {
			const i = cint(this.dataset.idx);
			if (!$(e.target).closest(".pc-tpl-delete").length) return edit_template(i);
			frappe.confirm(
				__('Are you sure you want to delete the template "{0}"?', [
					esc(templates[i].template_name || __("Unnamed")),
				]),
				() => {
					templates.splice(i, 1);
					draw_templates();
					dirty();
				}
			);
		});
	};
	draw_templates();

	if (!can) return;
	const $bar = $(`<div class="pc-actions">
		<button class="btn btn-default btn-sm">${__("Reset")}</button>
		<button class="btn btn-primary btn-sm">${__("Save Settings")}</button>
	</div>`).appendTo($root);
	$reset = $bar.find(".btn-default").on("click", () => draw_settings($c, ctx, s));
	if (s.name && ctx.access.can_create_float) {
		$(`<button class="btn btn-default btn-sm">${icon("plus")} ${__("New Float")}</button>`)
			.on("click", () =>
				call("get_petty_cash_settings", { petty_cash_float: "" }).then((n) =>
					draw_settings($c, ctx, n)
				)
			)
			.prependTo($bar);
	}
	$save = $bar.find(".btn-primary").on("click", async () => {
		$save.prop("disabled", true);
		try {
			check_reqd(c);
			const r = await call("save_petty_cash_settings", {
				petty_cash_float: s.name || "",
				settings: { ...values(c), expense_templates: templates },
			});
			set_float(r.name);
			await created(ctx, __("Settings saved successfully"));
		} catch (e) {
			console.error(e); // frappe already showed the message
			dirty();
		}
	});
	dirty();
}

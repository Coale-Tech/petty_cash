// Petty Cash Desk page shell: header, states, tab bar, Dashboard + Transactions tabs.
// Mirrors hoteli pages/petty-cash/List.vue, DashboardTab.vue, TransactionsTab.vue.
import {
	badge,
	bind_pager,
	call,
	empty_state,
	esc,
	fmt_date,
	icon,
	make_control,
	money,
	pager_html,
	set_company,
	voucher_link,
} from "./utils";
import { open_expense_dialog, open_pay_supplier_dialog, open_replenish_dialog } from "./dialogs";
import {
	render_journal_entry_tab,
	render_payment_entry_tab,
	render_replenishment_tab,
	render_settings_tab,
} from "./tabs";

frappe.provide("petty_cash");

const TABS = [
	{ key: "dashboard", label: __("Dashboard"), icon: "chart-pie", badge: "red" },
	{ key: "transactions", label: __("Transactions"), icon: "list", badge: "blue" },
	{ key: "journal", label: __("Journal Entries"), icon: "book" },
	{ key: "payments", label: __("Payments"), icon: "credit-card" },
	{ key: "replenishments", label: __("Replenishments"), icon: "refresh-cw" },
	{ key: "settings", label: __("Settings"), icon: "settings" },
];

const spinner = (size = "sm") =>
	`<span class="pc-icon-wrap pc-spin">${icon("loader", size)}</span>`;
const loading_block = (text) =>
	`<div class="pc-loading">${spinner("md")}<span>${esc(text)}</span></div>`;
const type_badge = (type) => badge(__(type), type === "Expense" ? "orange" : "green");

// [label, icon, right-aligned]
const list_head = (cols) =>
	cols
		.map(
			([label, ic, right]) =>
				`<th class="${right ? "text-right" : ""}">${icon(ic)}${label}</th>`
		)
		.join("");

petty_cash.PettyCashPage = class PettyCashPage {
	constructor(page) {
		this.tab = "dashboard";
		this.loading = false;
		this.error = null;
		this.txn_state = { from_date: "", to_date: "", type: "", page_size: 25 };
		this.ctx = {
			dashboard: null,
			access: null,
			refresh: () => this.refresh(),
			set_tab: (name) => this.set_tab(name),
		};

		this.$root = $(`<div class="pc-root">
			<div class="pc-header">
				<div>
					<h1 class="pc-title">${__("Petty Cash Management")}</h1>
					<p class="pc-subtitle">${__(
						"Cash handling, supplier payments, expense tracking, and replenishments"
					)}</p>
				</div>
				<button class="btn btn-default btn-sm pc-refresh">
					<span class="pc-icon-wrap">${icon("refresh-ccw")}</span>${__("Refresh")}
				</button>
			</div>
			<div class="pc-status"></div>
			<div class="pc-tabs-card" style="display: none">
				<nav class="pc-tabs"></nav>
				<div class="pc-tab-body"></div>
			</div>
		</div>`).appendTo(page.main);

		this.$refresh = this.$root.find(".pc-refresh").on("click", () => this.refresh());
		this.$status = this.$root
			.find(".pc-status")
			.on("click", ".pc-retry", () => this.refresh())
			.on("click", ".pc-configure", () => this.set_tab("settings"));
		this.$card = this.$root.find(".pc-tabs-card");
		this.$nav = this.$root
			.find(".pc-tabs")
			.on("click", ".pc-tab", (e) => this.set_tab(e.currentTarget.dataset.tab));
		this.$body = this.$root.find(".pc-tab-body");

		this.refresh();
	}

	refresh() {
		if (this.pending) return this.pending;
		this.loading = true;
		this.render_status();
		this.pending = Promise.all([call("get_petty_cash_dashboard"), call("check_user_access")])
			.then(([dashboard, access]) => {
				Object.assign(this.ctx, { dashboard, access });
				set_company(dashboard.company);
				this.error = null;
			})
			.catch((e) => {
				this.error = e?.message || __("An error occurred while loading data");
			})
			.finally(() => {
				this.loading = false;
				this.pending = null;
				this.render_status();
				this.render_tabs();
			});
		return this.pending;
	}

	set_tab(name) {
		this.tab = name;
		this.render_tabs();
	}

	render_status() {
		const d = this.ctx.dashboard;
		this.$refresh
			.prop("disabled", this.loading)
			.find(".pc-icon-wrap")
			.toggleClass("pc-spin", this.loading);

		let html = "";
		if (this.loading && !d) {
			html = loading_block(__("Loading petty cash dashboard..."));
		} else if (this.error) {
			html = `<div class="pc-alert pc-alert-red">
				${icon("circle-alert", "md")}
				<div>
					<div class="pc-alert-title">${__("Failed to load petty cash data")}</div>
					<p>${esc(this.error)}</p>
					<div class="pc-alert-actions">
						<button class="btn btn-danger btn-sm pc-retry">${icon("refresh-ccw")}${__("Retry")}</button>
					</div>
				</div>
			</div>`;
		}
		if (d && !d.configured) {
			const can_manage = this.ctx.access?.can_manage_settings;
			html += `<div class="pc-alert pc-alert-amber">
				${icon("triangle-alert", "md")}
				<div>
					<div class="pc-alert-title">${__("Petty Cash Settings not configured")}</div>
					${
						can_manage
							? `<p>${__(
									"Please configure the petty cash account and imprest amount in the Settings tab to get started."
							  )}</p>
							<div class="pc-alert-actions">
								<button class="btn btn-sm pc-btn-amber pc-configure">${__("Configure Settings")}</button>
							</div>`
							: ""
					}
				</div>
			</div>`;
		}
		this.$status.html(html);
	}

	render_tabs() {
		const { dashboard: d, access: a } = this.ctx;
		const show = !!d && (d.configured || a?.can_manage_settings);
		this.$card.toggle(show);
		if (!show) return;

		const tabs = TABS.filter((t) => t.key !== "settings" || a?.can_view_settings);
		if (!tabs.some((t) => t.key === this.tab)) this.tab = "dashboard";
		const counts = {
			dashboard: d.needs_replenishment ? "!" : null,
			transactions: d.today_summary?.expense_count || null,
		};
		this.$nav.html(
			tabs
				.map(
					(t) => `<button class="pc-tab ${
						t.key === this.tab ? "active" : ""
					}" data-tab="${t.key}">
						${icon(t.icon)}${t.label}${t.badge && counts[t.key] ? badge(String(counts[t.key]), t.badge) : ""}
					</button>`
				)
				.join("")
		);

		// Fresh container per render so handlers a renderer binds on it never accumulate.
		const $c = $('<div class="pc-tab-body"></div>');
		this.$body.replaceWith($c);
		this.$body = $c;
		({
			dashboard: () => render_dashboard($c, this.ctx),
			transactions: () => render_transactions($c, this.txn_state),
			journal: () => render_journal_entry_tab($c, this.ctx),
			payments: () => render_payment_entry_tab($c, this.ctx),
			replenishments: () => render_replenishment_tab($c, this.ctx),
			settings: () => render_settings_tab($c, this.ctx),
		}[this.tab]());
	}
};

function render_dashboard($c, ctx) {
	const d = ctx.dashboard || {};
	const need = d.needs_replenishment;
	const today = d.today_summary || {};
	const rows = d.recent_transactions || [];
	const page_size = 10;

	const stat = (color, label, value, ic, foot) => `<div class="pc-stat pc-stat-${color}">
		<div class="pc-stat-top">
			<div>
				<div class="pc-stat-label">${label}</div>
				<div class="pc-stat-value">${value}</div>
			</div>
			<div class="pc-stat-icon">${icon(ic, "lg")}</div>
		</div>
		<div class="pc-stat-foot">${foot}</div>
	</div>`;
	const action = (key, ic, color, title, sub, danger) => `<button class="pc-quick-action ${
		danger ? "pc-danger" : ""
	}" data-action="${key}">
		<span class="pc-icon-wrap pc-qa-${color}">${icon(ic, "lg")}</span>
		<span>
			<span class="pc-qa-title">${title}</span>
			<span class="pc-qa-sub">${sub}</span>
		</span>
	</button>`;

	const $d = $(`<div class="pc-dashboard">
		<div class="pc-stats">
			${stat(
				"blue",
				__("Current Balance"),
				money(d.current_balance),
				"dollar-sign",
				`<span>${__("Imprest: {0}", [money(d.imprest_amount)])}</span>`
			)}
			${stat(
				need ? "red" : "green",
				need ? __("Replenishment Needed") : __("Balance OK"),
				need ? money(d.replenishment_amount) : "✓",
				need ? "circle-alert" : "circle-check",
				`<span>${__("Trigger: {0}", [money(d.replenishment_trigger)])}</span>`
			)}
			${stat(
				"purple",
				__("Today's Expenses"),
				money(today.total_out),
				"trending-down",
				`<span>${__("{0} transactions", [today.expense_count || 0])}</span><span>${__(
					"In: {0}",
					[money(today.total_in)]
				)}</span>`
			)}
		</div>
		<div class="pc-card pc-quick">
			<div class="pc-card-title">${__("Quick Actions")}</div>
			<div class="pc-quick-grid">
				${action("pay", "users", "blue", __("Pay Supplier"), __("Cash payment to vendor"))}
				${action("expense", "file-text", "orange", __("Record Expense"), __("Transport, supplies, etc."))}
				${action(
					"replenish",
					"circle-plus",
					need ? "red" : "green",
					__("Replenish Cash"),
					need
						? __("Needed: {0}", [money(d.replenishment_amount)])
						: __("Top up petty cash"),
					need
				)}
			</div>
		</div>
		<div class="pc-card pc-list-card">
			<div class="pc-list-head">
				<h3>${__("Recent Transactions ({0})", [rows.length])}</h3>
				<span class="pc-muted pc-showing"></span>
			</div>
			<div class="pc-list-body"></div>
		</div>
	</div>`).appendTo($c.empty());

	const dialogs = {
		pay: open_pay_supplier_dialog,
		expense: open_expense_dialog,
		replenish: open_replenish_dialog,
	};
	$d.on("click", ".pc-quick-action", (e) => dialogs[e.currentTarget.dataset.action](ctx));

	const $body = $d.find(".pc-list-body");
	const draw = (page) => {
		const total = Math.max(1, Math.ceil(rows.length / page_size));
		const from = (page - 1) * page_size;
		$d.find(".pc-showing").text(
			rows.length
				? __("Showing {0} to {1} of {2}", [
						from + 1,
						Math.min(from + page_size, rows.length),
						rows.length,
				  ])
				: ""
		);
		if (!rows.length) {
			$body.html(
				empty_state(
					"inbox",
					__("No transactions found"),
					__("Record an expense or payment to see transactions here.")
				)
			);
			return;
		}
		$body.html(`<div class="pc-list-wrap"><table class="pc-list">
			<thead><tr>${list_head([
				[__("Date"), "calendar"],
				[__("Type"), "tag"],
				[__("Reference"), "file-text"],
				[__("Amount"), "dollar-sign", true],
				[__("Description"), "text-align-start"],
			])}</tr></thead>
			<tbody>${rows
				.slice(from, from + page_size)
				.map((r) => {
					const is_in = flt(r.debit) > 0;
					const desc = r.remarks || r.against || "-";
					return `<tr>
						<td>${fmt_date(r.posting_date)}</td>
						<td>${type_badge(r.transaction_type)}</td>
						<td>${voucher_link(r.voucher_type, r.voucher_no)}</td>
						<td class="text-right"><span class="${is_in ? "pc-amount-in" : "pc-amount-out"}">${
						is_in ? "+" : "-"
					}${money(is_in ? r.debit : r.credit)}</span></td>
						<td class="pc-truncate" title="${esc(desc)}">${esc(desc)}</td>
					</tr>`;
				})
				.join("")}</tbody>
		</table></div>${pager_html(page, total, rows.length, page_size)}`);
		bind_pager($body, draw);
	};
	draw(1);
}

function render_transactions($c, state) {
	const $t = $(`<div class="pc-transactions">
		<div class="pc-card pc-filters">
			<div class="pc-filter" data-f="from_date"></div>
			<div class="pc-filter" data-f="to_date"></div>
			<div class="pc-filter" data-f="type"></div>
			<div class="pc-filter-buttons">
				<button class="btn btn-default btn-sm pc-search">${icon("search")}${__("Search")}</button>
				<button class="btn btn-sm pc-reset">${__("Reset")}</button>
			</div>
		</div>
		<div class="pc-card pc-list-card">
			<div class="pc-list-head">
				<h3 class="pc-count"></h3>
				<div class="pc-list-head-right">
					<span class="pc-muted pc-showing"></span>
					<button class="btn btn-default btn-xs pc-export">${icon("download")}${__("Export")}</button>
				</div>
			</div>
			<div class="pc-select-banner-slot"></div>
			<div class="pc-list-body"></div>
		</div>
	</div>`).appendTo($c.empty());

	const field = (f, df) =>
		make_control($t.find(`[data-f="${f}"]`), { fieldname: f, ...df }, state[f]);
	const controls = {
		from_date: field("from_date", { fieldtype: "Date", label: __("From Date") }),
		to_date: field("to_date", { fieldtype: "Date", label: __("To Date") }),
		type: field("type", {
			fieldtype: "Select",
			label: __("Type"),
			options: [
				{ label: __("All Types"), value: "" },
				{ label: __("Expense"), value: "Expense" },
				{ label: __("Replenishment"), value: "Replenishment" },
			],
		}),
	};

	let rows = [];
	let page_rows = [];
	let page = 1;
	let loading = false;
	const selected = new Set();
	const $body = $t.find(".pc-list-body");

	const draw = () => {
		const n = rows.length;
		const size = state.page_size;
		const total = Math.max(1, Math.ceil(n / size));
		page = Math.min(page, total);
		const from = (page - 1) * size;
		page_rows = rows.slice(from, from + size);

		$t.find(".pc-count").text(__("Transactions ({0})", [n]));
		$t.find(".pc-showing").text(
			n ? __("Showing {0} to {1} of {2}", [from + 1, Math.min(from + size, n), n]) : ""
		);
		$t.find(".pc-export").prop("disabled", !n);
		$t.find(".pc-select-banner-slot").html(
			selected.size
				? `<div class="pc-select-banner">
					<span>${__("{0} selected", [selected.size])}</span>
					<div class="pc-select-actions">
						<button class="btn btn-default btn-xs pc-export-selected">${__("Export Selected")}</button>
						<button class="btn btn-xs pc-unselect">${__("Unselect all")}</button>
					</div>
				</div>`
				: ""
		);

		if (loading) return $body.html(loading_block(__("Loading transactions...")));
		if (!n)
			return $body.html(
				empty_state(
					"inbox",
					__("No transactions found"),
					__("Try adjusting your filters or date range.")
				)
			);

		const total_in = rows.reduce((s, r) => s + flt(r.debit), 0);
		const total_out = rows.reduce((s, r) => s + flt(r.credit), 0);
		const all_checked = page_rows.every((r) => selected.has(r.name));
		const amount = (v, cls) =>
			flt(v) > 0
				? `<span class="${cls}">${money(v)}</span>`
				: `<span class="pc-muted">-</span>`;
		$body.html(`<div class="pc-list-wrap"><table class="pc-list">
			<thead><tr>
				<th class="pc-check-col"><input type="checkbox" class="pc-check-all" ${
					all_checked ? "checked" : ""
				}></th>
				${list_head([
					[__("Date"), "calendar"],
					[__("Type"), "tag"],
					[__("Voucher"), "file-text"],
					[__("In"), "arrow-down-left", true],
					[__("Out"), "arrow-up-right", true],
					[__("Against"), "arrow-right"],
					[__("Description"), "text-align-start"],
				])}
			</tr></thead>
			<tbody>${page_rows
				.map(
					(r) => `<tr>
						<td class="pc-check-col"><input type="checkbox" class="pc-check" data-name="${esc(r.name)}" ${
						selected.has(r.name) ? "checked" : ""
					}></td>
						<td>${fmt_date(r.posting_date)}</td>
						<td>${type_badge(r.transaction_type)}</td>
						<td>${voucher_link(r.voucher_type, r.voucher_no)}</td>
						<td class="text-right">${amount(r.debit, "pc-amount-in")}</td>
						<td class="text-right">${amount(r.credit, "pc-amount-out")}</td>
						<td class="pc-truncate" title="${esc(r.against)}">${esc(r.against || "-")}</td>
						<td class="pc-truncate" title="${esc(r.remarks)}">${esc(r.remarks || "-")}</td>
					</tr>`
				)
				.join("")}</tbody>
		</table></div>
		<div class="pc-totals">
			<span class="pc-muted">${__("{0} transactions", [n])}</span>
			<div class="pc-totals-amounts">
				<span class="pc-amount-in">${__("Total In: {0}", [money(total_in)])}</span>
				<span class="pc-amount-out">${__("Total Out: {0}", [money(total_out)])}</span>
				<span class="pc-net">${__("Net: {0}", [money(total_in - total_out)])}</span>
			</div>
		</div>
		<div class="pc-pager-row">
			<label class="pc-muted">${__("Rows per page:")}
				<select class="form-control input-xs pc-page-size">
					${[25, 50, 100]
						.map(
							(v) =>
								`<option value="${v}" ${
									v === size ? "selected" : ""
								}>${v}</option>`
						)
						.join("")}
				</select>
			</label>
			${pager_html(page, total, n, size)}
		</div>`);
		bind_pager($body, (p) => {
			page = p;
			draw();
		});
	};

	const fetch = () => {
		loading = true;
		draw();
		call("get_petty_cash_transactions", {
			from_date: state.from_date,
			to_date: state.to_date,
			transaction_type: state.type,
			limit: 500,
		})
			.then((r) => (rows = r || []))
			.catch(() => (rows = []))
			.finally(() => {
				loading = false;
				page = 1;
				selected.clear();
				draw();
			});
	};

	const export_csv = (list) =>
		frappe.tools.downloadify(
			[
				[
					__("Date"),
					__("Type"),
					__("Voucher"),
					__("Against"),
					__("Description"),
					__("In"),
					__("Out"),
				],
				...list.map((r) => [
					r.posting_date,
					r.transaction_type,
					r.voucher_no,
					r.against,
					r.remarks,
					flt(r.debit),
					flt(r.credit),
				]),
			],
			null,
			"petty-cash-transactions"
		);
	const selected_rows = () => rows.filter((r) => selected.has(r.name));

	$t.on("click", ".pc-search", () => {
		for (const [k, control] of Object.entries(controls)) state[k] = control.get_value() || "";
		fetch();
	})
		.on("click", ".pc-reset", () => {
			Object.assign(state, { from_date: "", to_date: "", type: "" });
			Object.values(controls).forEach((control) => control.set_value(""));
			fetch();
		})
		.on("click", ".pc-export", () => export_csv(selected.size ? selected_rows() : rows))
		.on("click", ".pc-export-selected", () => export_csv(selected_rows()))
		.on("click", ".pc-unselect", () => {
			selected.clear();
			draw();
		})
		.on("change", ".pc-check", function () {
			this.checked ? selected.add(this.dataset.name) : selected.delete(this.dataset.name);
			draw();
		})
		.on("change", ".pc-check-all", function () {
			page_rows.forEach((r) =>
				this.checked ? selected.add(r.name) : selected.delete(r.name)
			);
			draw();
		})
		.on("change", ".pc-page-size", function () {
			state.page_size = cint(this.value);
			page = 1;
			draw();
		});

	fetch();
}

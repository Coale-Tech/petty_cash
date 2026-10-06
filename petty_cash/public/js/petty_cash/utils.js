// Shared helpers for the petty-cash Desk page. Every module imports from here.

const API = "petty_cash.api.";

// Whitelisted call; resolves with r.message, frappe shows server errors itself.
export const call = (method, args = {}) => frappe.xcall(API + method, args);

// Amounts render in the petty cash company's currency; set once the dashboard loads.
let currency;
export const set_company = (company) => (currency = erpnext.get_currency(company));
export const money = (v) => format_currency(flt(v), currency, 0);

export const fmt_date = (d) =>
	d
		? new Date(d).toLocaleDateString("en-KE", {
				day: "2-digit",
				month: "short",
				year: "numeric",
		  })
		: "-";

export const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

export const icon = (name, size = "sm") => frappe.utils.icon(name, size);

// color: gray | blue | green | red | orange | amber | purple
export const badge = (label, color = "gray") =>
	`<span class="pc-badge pc-badge-${color}">${esc(label)}</span>`;

export const voucher_link = (doctype, name) =>
	name
		? `<a class="pc-link" href="/app/${frappe.router.slug(doctype)}/${encodeURIComponent(
				name
		  )}">${esc(name)}</a>`
		: "-";

export const docstatus_badge = (docstatus) =>
	({
		0: badge(__("Draft"), "orange"),
		1: badge(__("Submitted"), "green"),
		2: badge(__("Cancelled"), "red"),
	}[docstatus] || badge("-"));

// [1, "...", 4, 5, 6, "...", 10] — same window as the hoteli list pagers.
export function visible_pages(current, total) {
	if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
	const pages = [1];
	if (current > 3) pages.push("...");
	for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++)
		pages.push(i);
	if (current < total - 2) pages.push("...");
	pages.push(total);
	return pages;
}

// Pager markup; wire clicks with `bind_pager`.
export function pager_html(current, total, total_rows, page_size) {
	if (total_rows <= page_size) return "";
	const from = (current - 1) * page_size + 1;
	const to = Math.min(current * page_size, total_rows);
	const btn = (page, content, disabled, active) =>
		`<button class="pc-page-btn ${active ? "active" : ""}" data-page="${page}" ${
			disabled ? "disabled" : ""
		}>${content}</button>`;
	return `<div class="pc-pager">
		<span class="pc-muted">${__("Showing {0}-{1} of {2}", [from, to, total_rows])}</span>
		<div class="pc-pager-buttons">
			${btn(1, icon("chevrons-left"), current === 1)}
			${btn(current - 1, icon("chevron-left"), current === 1)}
			${visible_pages(current, total)
				.map((p) =>
					p === "..."
						? `<span class="pc-muted">…</span>`
						: btn(p, p, false, p === current)
				)
				.join("")}
			${btn(current + 1, icon("chevron-right"), current === total)}
			${btn(total, icon("chevrons-right"), current === total)}
		</div>
	</div>`;
}

export function bind_pager($root, on_page) {
	$root.find(".pc-page-btn").on("click", function () {
		if (!this.disabled) on_page(cint(this.dataset.page));
	});
}

// Empty-state block used inside list cards.
export const empty_state = (icon_name, title, sub = "") =>
	`<div class="pc-empty">${icon(icon_name, "lg")}<div class="pc-empty-title">${esc(
		title
	)}</div>${sub ? `<div class="pc-muted">${esc(sub)}</div>` : ""}</div>`;

// Desk control bound into a container; returns the control.
export function make_control($parent, df, value) {
	const control = frappe.ui.form.make_control({
		parent: $parent,
		df,
		render_input: true,
	});
	if (value !== undefined && value !== null) control.set_value(value);
	return control;
}

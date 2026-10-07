// Add multiple - replaces the native "Add multiple" grid button (LinkSelector: one quantity
// prompt per item, no stock) with the "Select Items" dialog from kimzone's item_selector.js,
// on every ERPNext items table: search by code / name / free text, "Item in Stock" and
// "Zero Stock Only" filters, a quantity column per warehouse, tick or double-click to add.

const API = "petty_cash.item_picker.search_items";
const PAGE_SIZE = 25;
// Stock leaves on submit, so an item with none on the shelf is refused and each row is
// pointed at the warehouse that holds it. Every other document may list items it does not
// hold - orders, quotes, purchases, requests and receipts.
const SHELF_DOCS = new Set(["Sales Invoice", "Delivery Note"]);
// Documents whose items table gets the dialog; BOM, Opportunity and Blanket Order keep the
// native selector.
const DOCTYPES = [
	"Quotation",
	"Sales Order",
	"Delivery Note",
	"Sales Invoice",
	"Supplier Quotation",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
	"Material Request",
	"Stock Entry",
];

frappe.provide("petty_cash");

petty_cash.item_selector = {
	async open(frm) {
		const shelf = SHELF_DOCS.has(frm.doctype);
		const state = {
			frm,
			shelf,
			search_by: "free_text",
			search: "",
			in_stock_only: false,
			zero_stock_only: false,
			// Ticked rows survive a search or filter change: the table is rebuilt on
			// every search, so the DOM alone only remembers what is on screen now.
			selected: new Map(),
			items: [],
			total: 0,
			warehouses: [],
			price_list: frm.doc.selling_price_list || frm.doc.buying_price_list,
		};

		frappe.dom.freeze(__("Loading items..."));
		try {
			await this.fetch_items(state);
		} catch (error) {
			frappe.dom.unfreeze();
			frappe.msgprint(__("Failed to load items."));
			return;
		}
		frappe.dom.unfreeze();

		const dialog = new frappe.ui.Dialog({
			title: __("Select Items"),
			size: "extra-large",
			// Detach the modal once hidden so repeated opens never leak duplicate nodes.
			onhide() {
				this.$wrapper.remove();
			},
			fields: [
				{
					fieldname: "radio_container",
					fieldtype: "HTML",
					label: __("Search Options"),
					options: `
						<div class="pc-ip-row">
							<label><input type="radio" name="pc_ip_search_by" value="item_code"> ${__("Item Code")}</label>
							<label><input type="radio" name="pc_ip_search_by" value="item_name"> ${__("Item Name")}</label>
							<label><input type="radio" name="pc_ip_search_by" value="free_text" checked> ${__("Free Text")}</label>
						</div>
					`,
				},
				{
					fieldname: "search",
					fieldtype: "Data",
					label: __("Search Item"),
					onchange: () => this.search(state, dialog.get_value("search")),
				},
				{
					fieldname: "search_controls",
					fieldtype: "HTML",
					options: `
						<div class="pc-ip-row">
							<button type="button" class="btn btn-default btn-sm pc-ip-clear">${__("Clear Search")}</button>
							<label><input type="checkbox" class="pc-ip-in-stock"> ${__("Item in Stock")}</label>
							<label><input type="checkbox" class="pc-ip-zero-stock"> ${__("Zero Stock Only")}</label>
						</div>
					`,
				},
				{ fieldname: "items_html", fieldtype: "HTML", label: __("Items") },
				{ fieldname: "pagination_info", fieldtype: "HTML", options: '<span class="pc-ip-pagination"></span>' },
			],
			primary_action_label: __("Add Selected Items"),
			primary_action: () => this.add_selected(state),
		});
		state.dialog = dialog;
		dialog.show();

		dialog.$wrapper.find('input[name="pc_ip_search_by"]').on("change", (event) => {
			state.search_by = event.target.value;
			this.search(state, state.search);
		});
		dialog.$wrapper.find(".pc-ip-clear").on("click", () => {
			dialog.fields_dict.search.set_value("");
			this.search(state, "");
		});
		const $in_stock = dialog.$wrapper.find(".pc-ip-in-stock");
		const $zero_stock = dialog.$wrapper.find(".pc-ip-zero-stock");
		$in_stock.on("change", (event) => {
			state.in_stock_only = event.target.checked;
			if (event.target.checked) {
				state.zero_stock_only = false;
				$zero_stock.prop("checked", false);
			}
			this.search(state, state.search);
		});
		$zero_stock.on("change", (event) => {
			state.zero_stock_only = event.target.checked;
			if (event.target.checked) {
				state.in_stock_only = false;
				$in_stock.prop("checked", false);
			}
			this.search(state, state.search);
		});

		dialog.fields_dict.items_html.$wrapper.html(this.table_html(state));
		this.make_columns_resizable(dialog.$wrapper.find(".pc-ip-table")[0]);
		dialog.$wrapper.find(".pc-ip-select-all").on("change", (event) => {
			dialog.$wrapper
				.find("tbody input[type='checkbox']")
				.prop("checked", event.target.checked)
				.trigger("change");
		});
		// Double-click a row to add just that item.
		dialog.$wrapper.find(".pc-ip-table tbody").on("dblclick", "tr", (event) => {
			if ($(event.target).is("input")) return;
			const item = state.items[$(event.currentTarget).index()];
			if (item) this.add_one(state, item, $(event.currentTarget));
		});
		this.render_rows(state);
	},

	async fetch_items(state) {
		const { frm } = state;
		const { warehouses, total, items } = await frappe.xcall(API, {
			doctype: frm.doctype,
			company: frm.doc.company || frappe.defaults.get_user_default("Company"),
			search: state.search,
			search_by: state.search_by,
			in_stock_only: state.in_stock_only ? 1 : 0,
			zero_stock_only: state.zero_stock_only ? 1 : 0,
			page_length: PAGE_SIZE,
			price_list: state.price_list,
		});
		Object.assign(state, { warehouses, total, items });
	},

	async search(state, value) {
		state.search = value || "";
		try {
			await this.fetch_items(state);
		} catch (error) {
			frappe.msgprint(__("Error fetching items. Please try again."));
			return;
		}
		this.render_rows(state);
	},

	headers(state) {
		return [
			{ key: "item_code", label: __("Item Code") },
			{ key: "item_name", label: __("Item Name") },
			{ key: "brand", label: __("Brand") },
			{ key: "qty_ordered", label: __("Qty Ordered") },
			...state.warehouses.map((wh) => ({ key: wh, label: __("{0} Qty", [wh]), warehouse: true })),
			...(state.price_list ? [{ key: "price", label: __("Price List Rate") }] : []),
			{ key: "uom", label: __("UOM") },
			{ key: "total_qty", label: __("Total Qty") },
		];
	},

	table_html(state) {
		const headers = this.headers(state);
		return `
			<div class="pc-ip-table-container">
				<table class="pc-ip-table" style="--pc-ip-min-width: ${60 + headers.length * 110}px;">
					<thead>
						<tr>
							<th class="pc-ip-pick-col"><input type="checkbox" class="pc-ip-select-all"></th>
							${headers
								.map(
									(h) =>
										`<th>${frappe.utils.escape_html(h.label)}<div class="pc-ip-resizer"></div></th>`
								)
								.join("")}
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</div>
		`;
	},

	render_rows(state) {
		const headers = this.headers(state);
		const $body = state.dialog.$wrapper.find(".pc-ip-table tbody").empty();
		const $text = state.dialog.$wrapper.find(".pc-ip-pagination");

		if (!state.items.length) {
			$body.append(
				$("<tr>").append(
					$(`<td colspan="${headers.length + 1}" class="text-center">`).text(
						__("No matching items found")
					)
				)
			);
			$text.text(__("No matching items found"));
			return;
		}

		for (const item of state.items) {
			const stored = state.selected.get(item.item_code);
			const $tr = $("<tr class='pc-ip-item-row'>");
			const $box = $("<input type='checkbox'>").prop("checked", Boolean(stored));
			$tr.append($("<td>").append($box));

			let $qty;
			for (const header of headers) {
				const $td = $("<td>");
				if (header.key === "qty_ordered") {
					$qty = $("<input type='number' min='0' class='pc-ip-qty' placeholder='0'>").val(
						stored ? stored.qty : 1
					);
					$td.append($qty);
				} else if (header.warehouse) {
					$td.text(format_number(item.warehouse_qty[header.key]));
				} else if (header.key === "price") {
					$td.text(item.price == null ? "" : format_currency(item.price, state.frm.doc.currency));
				} else if (header.key === "total_qty") {
					$td.text(item.is_stock_item ? format_number(item.total_qty) : __("Not stocked"));
				} else {
					$td.text(item[header.key] ?? "");
				}
				$tr.append($td);
			}

			// Snapshot on any change to the row and drop it on untick, so what stays
			// selected survives a search or filter change.
			const sync = () => {
				if ($box.prop("checked")) {
					state.selected.set(item.item_code, { item, qty: flt($qty.val()) });
				} else {
					state.selected.delete(item.item_code);
				}
			};
			$box.on("change", sync);
			$qty.on("input", () => $box.prop("checked") && sync());
			$body.append($tr);
		}

		$text.text(__("Showing {0}-{1} of {2} item(s)", [1, state.items.length, state.total]));
	},

	make_columns_resizable(table) {
		table.querySelectorAll("th").forEach((th) => {
			const resizer = th.querySelector(".pc-ip-resizer");
			if (!resizer) return;

			let start_x, start_width;
			const do_drag = (event) => {
				const width = start_width + event.pageX - start_x;
				if (width > 50) th.style.width = width + "px";
			};
			const stop_drag = () => {
				document.documentElement.removeEventListener("mousemove", do_drag);
				document.documentElement.removeEventListener("mouseup", stop_drag);
			};
			resizer.addEventListener("mousedown", (event) => {
				event.preventDefault();
				start_x = event.pageX;
				start_width = th.getBoundingClientRect().width;
				document.documentElement.addEventListener("mousemove", do_drag);
				document.documentElement.addEventListener("mouseup", stop_drag);
			});
		});
	},

	async add_selected(state) {
		const picks = [];
		const skipped = [];
		state.selected.forEach(({ item, qty }) => {
			if (!(qty > 0)) return;
			if (state.shelf && item.is_stock_item && !(flt(item.total_qty) > 0)) {
				skipped.push(item.item_code);
			} else {
				picks.push({ item, qty });
			}
		});

		if (skipped.length) {
			frappe.msgprint({
				title: __("Some items were not added"),
				message:
					__("The following items have no available stock and were skipped:") +
					"<br><ul>" +
					skipped.map((code) => `<li>${frappe.utils.escape_html(code)}</li>`).join("") +
					"</ul>",
				indicator: "orange",
			});
		}
		if (!picks.length) {
			frappe.msgprint(__("No valid items to add."));
			return;
		}
		state.dialog.hide();
		await this.add_items(state, picks);
	},

	async add_one(state, item, $tr) {
		const qty = flt($tr.find(".pc-ip-qty").val());
		if (state.shelf && item.is_stock_item && !(flt(item.total_qty) > 0)) {
			frappe.show_alert({ message: __("Cannot add item with zero available stock."), indicator: "red" });
			return;
		}
		if (!(qty > 0)) {
			frappe.show_alert({ message: __("Cannot add item with zero quantity."), indicator: "red" });
			return;
		}
		await this.add_items(state, [{ item, qty }]);
		$tr.find("input[type='checkbox']").prop("checked", true).trigger("change");
	},

	// The document's own warehouse wins whenever it holds stock; otherwise the warehouse
	// holding the most. Only for documents that sell off the shelf and tables that have
	// a warehouse column; everywhere else ERPNext's defaults fill it.
	pick_warehouse(state, item) {
		const stock = item.warehouse_qty;
		const own = state.frm.doc.set_warehouse;
		if (own && flt(stock[own]) > 0) return own;
		const [best, qty] = Object.entries(stock).reduce((a, b) => (flt(b[1]) > flt(a[1]) ? b : a), ["", 0]);
		return flt(qty) > 0 ? best : "";
	},

	async add_items(state, picks) {
		const { frm } = state;
		const table = frm.fields_dict.items.grid.df.options;
		const pick_warehouse = state.shelf && frappe.meta.has_field(table, "warehouse");

		// Drop the blank row a new document opens with, so duplicate detection is
		// accurate and the first use does not end in "Item Code is required in row 1".
		// Done the way `frappe.model.clear_table` does it (model.js:643).
		for (const row of (frm.doc.items || []).filter((r) => !r.item_code)) {
			delete locals[row.doctype][row.name];
		}
		frm.doc.items = (frm.doc.items || []).filter((r) => r.item_code);
		frm.doc.items.forEach((row, i) => (row.idx = i + 1));

		frappe.dom.freeze(__("Adding {0} items...", [picks.length]));
		try {
			// One at a time on purpose: each `item_code` change calls `get_item_details`
			// and recalculates the totals, and concurrent replies overwrite each other.
			for (const { item, qty } of picks) {
				const existing = frm.doc.items.find((r) => r.item_code === item.item_code);
				if (existing) {
					await frappe.model.set_value(existing.doctype, existing.name, "qty", qty);
					continue;
				}
				const row = frm.add_child("items");
				await frappe.model.set_value(row.doctype, row.name, { item_code: item.item_code, qty });
				// `item_code`'s trigger recomputes the warehouse from Item/Item Group/Brand/
				// Stock Settings defaults and blanks it when none are set, so set the pick
				// again once that settles.
				const warehouse = pick_warehouse && this.pick_warehouse(state, item);
				if (warehouse) await frappe.model.set_value(row.doctype, row.name, "warehouse", warehouse);
			}
		} finally {
			frappe.dom.unfreeze();
		}
		frm.refresh_field("items");
	},
};

// Grid is an ES-module class with no global, so take it from the first items grid built.
// "setup" runs before ERPNext's onload calls `grid.set_multiple_add`.
let patched = false;
function patch_grid(grid) {
	if (patched) return;
	patched = true;
	const proto = Object.getPrototypeOf(grid);
	const native = proto.set_multiple_add;
	proto.set_multiple_add = function (link, qty) {
		if (!this.frm || this.df.fieldname !== "items" || !DOCTYPES.includes(this.frm.doctype)) {
			return native.call(this, link, qty);
		}
		if (this.multiple_set) return;
		$(this.wrapper)
			.find(".grid-add-multiple-rows")
			.removeClass("hidden")
			.on("click", () => {
				petty_cash.item_selector.open(this.frm);
				return false;
			});
		this.multiple_set = true;
	};
}

for (const doctype of DOCTYPES) {
	frappe.ui.form.on(doctype, { setup: (frm) => patch_grid(frm.get_field("items").grid) });
}

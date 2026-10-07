"""Server side of the Add Multiple Items dialog (``public/js/item_picker.bundle.js``).

The dialog is opened by the ``Add Multiple Items`` button field that ``fixtures/custom_field.json``
puts above the items table of the selling, buying and stock documents. Items come back with the
stock in every leaf warehouse of the document's company, so the dialog can show a quantity column
per warehouse while the operator picks.
"""

import frappe
from frappe.query_builder.functions import Coalesce, Count, Sum
from frappe.utils import cint, cstr, flt, nowdate

# Only items flagged for the document's side of the business are offered. Anything else
# (Material Request, Stock Entry) takes every enabled item.
SELLING = {"Quotation", "Sales Order", "Delivery Note", "Sales Invoice"}
BUYING = {"Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"}


def _warehouses(company):
	"""Leaf, enabled warehouses of ``company``; queried live so a renamed, added or
	disabled warehouse shows up in the dialog without a code change."""
	if not company:
		return []
	return frappe.get_all(
		"Warehouse",
		filters={"company": company, "is_group": 0, "disabled": 0},
		pluck="name",
		order_by="name",
	)


def _prices(price_list, item_codes):
	"""Today's list price per item. Only plain rows (no customer, supplier or batch) are
	shown: a price tied to one of those is not *the* price of the item, and ERPNext's own
	``get_item_details`` fills the real rate when the row lands in the grid anyway."""
	if not (price_list and item_codes):
		return {}
	today = nowdate()
	prices = {}
	for row in frappe.get_all(
		"Item Price",
		filters={
			"price_list": price_list,
			"item_code": ("in", item_codes),
			"customer": ("is", "not set"),
			"supplier": ("is", "not set"),
			"batch_no": ("is", "not set"),
		},
		fields=["item_code", "price_list_rate", "valid_from", "valid_upto"],
		order_by="valid_from asc",
	):
		if (not row.valid_from or cstr(row.valid_from) <= today) and (
			not row.valid_upto or cstr(row.valid_upto) >= today
		):
			prices[row.item_code] = flt(row.price_list_rate)  # latest valid_from wins
	return prices


@frappe.whitelist()
def search_items(
	doctype,
	company,
	search=None,
	search_by="free_text",
	in_stock_only=0,
	zero_stock_only=0,
	start=0,
	page_length=25,
	price_list=None,
):
	"""One page of items, the total the filters match, and the warehouse columns.

	``search_by`` narrows the match to ``item_code`` or ``item_name``; anything else
	searches code, name and brand. Every word of ``search`` must match (AND across words,
	OR across columns). ``in_stock_only`` and ``zero_stock_only`` filter on stock summed
	across the company's warehouses; a service has no Bin and never will, so "in stock"
	keeps it and "zero stock" drops it - the filters are about empty shelves, not about
	untracked items.
	"""
	frappe.has_permission("Item", "read", throw=True)
	frappe.has_permission(doctype, "read", throw=True)

	warehouses = _warehouses(company)
	item = frappe.qb.DocType("Item")
	bin_ = frappe.qb.DocType("Bin")
	# One aggregated join rather than one join per warehouse - a company can have more
	# warehouses than a single MariaDB statement may join. `[""]` matches no warehouse.
	stock = (
		frappe.qb.from_(bin_)
		.select(bin_.item_code, Sum(bin_.actual_qty).as_("qty"))
		.where(bin_.warehouse.isin(warehouses or [""]))
		.groupby(bin_.item_code)
		.as_("stock")
	)
	total_stock = Coalesce(stock.qty, 0)

	query = (
		frappe.qb.from_(item)
		.left_join(stock)
		.on(stock.item_code == item.name)
		.where((item.disabled == 0) & (item.has_variants == 0))
	)
	if doctype in SELLING:
		query = query.where(item.is_sales_item == 1)
	elif doctype in BUYING:
		query = query.where(item.is_purchase_item == 1)

	columns = {
		"item_code": [item.name],
		"item_name": [item.item_name],
	}.get(search_by, [item.name, item.item_name, item.brand])
	for word in (search or "").split():
		clause = columns[0].like(f"%{word}%")
		for column in columns[1:]:
			clause |= column.like(f"%{word}%")
		query = query.where(clause)

	# Mutually exclusive on the client, but guarded here too. Zero wins if both arrive.
	if cint(zero_stock_only):
		query = query.where((total_stock == 0) & (item.is_stock_item == 1))
	elif cint(in_stock_only):
		query = query.where((total_stock > 0) | (item.is_stock_item == 0))

	total = query.select(Count(item.name)).run()[0][0]
	items = (
		query.select(
			item.name.as_("item_code"),
			item.item_name,
			item.brand,
			item.stock_uom.as_("uom"),
			item.is_stock_item,
			total_stock.as_("total_qty"),
		)
		.orderby(item.name)
		.limit(cint(page_length))
		.offset(cint(start))
		.run(as_dict=True)
	)

	by_warehouse = {row.item_code: dict.fromkeys(warehouses, 0) for row in items}
	if items and warehouses:
		for row in frappe.get_all(
			"Bin",
			filters={"item_code": ("in", list(by_warehouse)), "warehouse": ("in", warehouses)},
			fields=["item_code", "warehouse", "actual_qty"],
		):
			by_warehouse[row.item_code][row.warehouse] = row.actual_qty
	prices = _prices(price_list, list(by_warehouse))
	for row in items:
		row["warehouse_qty"] = by_warehouse[row.item_code]
		row["price"] = prices.get(row.item_code)

	return {"warehouses": warehouses, "total": total, "items": items}

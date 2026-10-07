import unittest

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from petty_cash.item_picker import _warehouses, search_items

PREFIX = "PC-PICKER-"
PRICE_LIST = "Standard Selling"


class TestItemPicker(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.company = next(
			(c for c in frappe.get_all("Company", pluck="name") if len(_warehouses(c)) >= 2), None
		)
		if not cls.company or not frappe.db.exists("Price List", PRICE_LIST):
			raise unittest.SkipTest("Needs a company with two leaf warehouses and the Standard Selling list")
		cls.stocked_wh, cls.empty_wh = _warehouses(cls.company)[:2]

		cls.stocked = cls._item("STOCKED", is_stock_item=1)
		cls.empty = cls._item("EMPTY", is_stock_item=1)
		cls.service = cls._item("SERVICE", is_stock_item=0)
		cls.not_for_sale = cls._item("NOT-FOR-SALE", is_stock_item=1, is_sales_item=0)
		frappe.get_doc(
			{"doctype": "Bin", "item_code": cls.stocked, "warehouse": cls.stocked_wh, "actual_qty": 5}
		).insert()

	@classmethod
	def _item(cls, suffix, **flags):
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": PREFIX + suffix,
				"item_name": "Picker " + suffix.title(),
				"item_group": frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name")[0],
				"stock_uom": "Nos",
				**flags,
			}
		).insert()
		return PREFIX + suffix

	def search(self, doctype="Material Request", **kwargs):
		kwargs.setdefault("search", PREFIX)
		return search_items(doctype, self.company, **kwargs)

	def codes(self, **kwargs):
		return sorted(row.item_code for row in self.search(**kwargs)["items"])

	def test_stock_is_reported_per_warehouse_and_summed(self):
		(row,) = self.search(search=self.stocked)["items"]
		self.assertEqual(row.total_qty, 5)
		self.assertEqual(row.warehouse_qty[self.stocked_wh], 5)
		self.assertEqual(row.warehouse_qty[self.empty_wh], 0)

	def test_stock_filters_keep_services_out_of_the_shelf_question(self):
		self.assertEqual(self.codes(in_stock_only=1), sorted([self.stocked, self.service]))
		self.assertEqual(self.codes(zero_stock_only=1), sorted([self.empty, self.not_for_sale]))

	def test_selling_documents_only_offer_sales_items(self):
		self.assertNotIn(self.not_for_sale, self.codes(doctype="Sales Invoice"))
		self.assertIn(self.not_for_sale, self.codes(doctype="Material Request"))

	def test_search_by_narrows_to_the_chosen_column(self):
		# "PC-PICKER-" is in every code and in no name
		self.assertEqual(self.codes(search_by="item_name"), [])
		self.assertEqual(len(self.codes(search_by="item_code")), 4)

	def test_every_word_must_match(self):
		self.assertEqual(self.codes(search="picker stocked"), [self.stocked])
		self.assertEqual(self.codes(search="picker nonesuch"), [])

	def test_total_counts_every_match_not_one_page(self):
		result = self.search(page_length=1)
		self.assertEqual(len(result["items"]), 1)
		self.assertEqual(result["total"], 4)

	def test_price_is_todays_plain_list_price(self):
		for rate, valid_from in (
			(10, add_days(nowdate(), -10)),
			(20, add_days(nowdate(), -1)),
			(99, add_days(nowdate(), 5)),
		):
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": self.stocked,
					"price_list": PRICE_LIST,
					"price_list_rate": rate,
					"valid_from": valid_from,
				}
			).insert()
		(row,) = self.search(search=self.stocked, price_list=PRICE_LIST)["items"]
		self.assertEqual(row.price, 20)
		(row,) = self.search(search=self.stocked)["items"]
		self.assertIsNone(row.price)

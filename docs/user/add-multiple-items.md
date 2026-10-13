# Add Multiple Items

The native **Add multiple** button under the items table of Quotation, Sales Order, Sales Invoice, Delivery Note, Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice, Material Request and Stock Entry opens a **Select Items** dialog.

- Search by Item Code, Item Name or Free Text (every word must match).
- **Item in Stock** and **Zero Stock Only** filters.
- One column per leaf warehouse of the company, list price and Total Qty.
- Tick rows and set quantities, then **Add Selected Items**; double-click adds one row. Selections survive new searches.
- Sales Invoice and Delivery Note refuse items with no stock (skipped items are listed) and pick the warehouse with the most stock. Existing rows for the same item get their quantity increased.
- Selling documents list only sales items; buying documents only purchase items.

BOM, Opportunity and Blanket Order keep the native selector.

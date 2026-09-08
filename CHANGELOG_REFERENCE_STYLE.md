# PharmaStock — Saved Reference Style Update

Applied the saved PharmaStock reference-board visual language across the entire application.

## Visual changes
- Full-width professional top header with PharmaStock logo, global search, notifications, Bangladesh date/time, Light/Dark controls, Export CSV, user profile, and Logout.
- Dark teal/green sidebar positioned below the header with compact rounded navigation items and green active state.
- Dashboard reordered to match the reference hierarchy: four primary KPI cards, four secondary KPI cards, three-column analytics/best-seller/notification area, quick actions, and stock alerts.
- Added dashboard Total Invoices KPI backed by the existing sales data.
- Replaced the dashboard sales/profit horizontal bars with a compact two-line SVG chart using real analytics data.
- Standardized rounded white cards, subtle borders, compact tables, labels-above-input forms, and modern buttons across all pages.
- Updated Sales & Billing, Stock In, Analytics, Profit & Loss, Reports, Suppliers, Customers, Deleted Invoices, Admin Panel, Staff Activity History, Settings, and Login to share the same visual system.
- Preserved Light/Dark mode, sidebar collapse, admin-only controls, activity deletion, barcode scanner, batch/expiry logic, invoice logic, and existing API/database behavior.

## Validation
- `python -m py_compile app.py`
- `node --check static/app.js`

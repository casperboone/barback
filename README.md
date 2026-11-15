# BarBack

Next.js app for our Rust Food supplier catalog, assortment and ordering.

## Setup

```bash
npm install
cp .env.example .env   # fill in SUPPLIER_USERNAME / SUPPLIER_PASSWORD
npm run db:migrate
npm run dev
```

Then press **Import products** on http://localhost:3000/imports.

Numbers and dates look the same on every screen, Dutch numbers (1.234,5) and
numeric dates (01-11-2026), because they all go through `src/lib/format.ts`.

`npm test` runs the unit tests. They cover pure calculations and can't reach
the database.

## Needs attention

`/attention`, last in the header, gathers what is worth doing something about
from the other screens. Each kind gets a card with a count, a line on what it
adds up to, the worst five cases (the rest fold open underneath) and a link to
the screen with all of them. Every case leads to where it's dealt with. Kinds
with nothing to do are listed as checked, and with no cards at all the page
says "All clear". The cards always come in this order, so each has its place
on the phone:

- **Payments**: open entries past their due date, plus anything due within a
  week, like the outstanding list (amounts including VAT).
- **Orders**: lines not delivered and orders with no invoice two weeks after
  sending (the same as *Not delivered*), orders with documents Rust may have
  made for them that are "very likely" or "possibly" theirs, and invoiced
  orders with lines to tick off by hand.
- **Pricing**: the items in the pricing screen's *Needs attention* view,
  counted per flag, red flags first; its link opens that view
  (`/pricing?view=attention`).
- **Gone from Rust's catalog**: items on our list, for sale or not, whose
  product Rust no longer lists. Each opens the item on the order list, to link
  another product or archive it.
- **Imports**: the catalog when it hasn't synced in 7 days, the documents in 3
  (orders and payments are followed with them), a failed last run, or
  documents left to read, with the import button right there.

Some of it you know about and leave as it is. The tick at the end of a row
acknowledges it: it stops counting and moves to *Acknowledged* at the bottom,
where it can be put back. It stays there only as long as it is in the state
you acknowledged (`attention_acknowledgements` keeps a fingerprint of it), so
it shows again once it changes: an invoice that goes from due to late or to
another amount, a line that is short by more, a price flag with other
amounts, another document to link, or a newer import run. Acknowledging only
affects this page; the other screens keep their own flags.

Everything comes from the queries and signals the other screens use
(`src/lib/attention/queries.ts`), so the counts agree with theirs.

## Order list and ordering

`/order-list` is the bar's own list, grouped into categories that double as
headings. Walking around the stock, you raise the amount per item with the
+/− buttons; every change saves on its own and a bar at the bottom shows how
many items and roughly what it costs. Items are edited by tapping their name,
which opens the item dialog (see [The item dialog](#the-item-dialog)).

Each row also says when the item was last bought and how much, from the
supplier's documents. Open orders count too, labelled "Ordered" in amber: their
invoices arrive weeks later, and an older date could lead to ordering twice.
Credit notes, returns and deposits don't count, and an item without a catalog
link shows nothing.

Each category also takes quick note lines (the note button next to its
heading) for jotting something down while walking around. "Rearrange" turns
the list into drag handles for reordering items, notes and whole categories;
moving an item to another category happens in its form.

A target is the desired stock in the supplier's sales unit, shown big next to
the +/− buttons as a reference while ordering.

The amounts belong to an order, not to the item. The first + starts a draft, and
the selector above the list switches between drafts or starts another; each
device remembers the one it last worked on. "One-off" adds something for this
order only, without putting it on the list: a catalog product, which goes to the
cart like anything else, or free text, which you tick off by hand. A note can
become a one-off with the button on its row.

"Review" (in the bar at the bottom) opens `/order-list/review`: notes and
products without a usable catalog link are listed on top as things to handle
yourself, followed by everything that goes into the supplier cart. "Add all to
the supplier cart" sends the whole order in one request
(`/Product/additems`, the call behind their own "add all" button), with an
optional checkbox to delete the notes afterwards. Lines for the same product go
in once, with their total. The supplier refuses such a batch as a whole over a
single line it does not like, so anything that does not come back accepted is
retried on its own (`/OrderConfirm/quickItemAdd`) to find out which product was
the problem. A refused line stays on the order to send again, notes are only
deleted when the whole order went through, and the order is refused when it
changed while you were reviewing. Placing the order itself still happens at Rust
Food: **the app never places an order.**

### Tracking what came of an order

Sending keeps the amounts on the order and shows a reference like `IM-42`. Paste
that into "Uw referentie" at Rust's checkout, and everything Rust shows for it
links to the order by itself. "Import invoices & orders" on `/orders` is what
brings those documents in; nothing runs on a schedule.

Without a reference (forgotten, or a `VORD` order Rust created itself) the order
page suggests documents from around that date with the same products, for you to
link or turn down, and you can pick one by hand. One order can have several Rust
orders, invoices and credit notes; a document belongs to one order at most.

Rust has no delivery notes, so "delivered" means invoiced, less credit notes. A
line waits until its Rust order has an invoice and has left the open list, and
then counts as short or missing; an order with no invoice two weeks after sending
gets a flag. Deposits, the fuel surcharge and corrections don't count. What's on
the documents but not on the order shows as extra, and returns on an invoice show
apart, because they're usually from an earlier delivery. `/orders/not-delivered`
lists everything short over all orders, to add to the current order or accept. If
something similar came instead, the order page offers it as a replacement. Free
text and items without a catalog link can't be matched, so they're ticked off by
hand. The logic is in `src/lib/orders/matching.ts`, with its tests next to it.

A line is highlighted when Rust charged another price than we ordered at, down
to the cent: the order page says what we ordered at, what Rust charged and the
difference per unit and for the line, and `/orders` shows how many lines differ.
"Ordered at" is the catalog price when the line went to the cart (sending
refreshes it), and Rust's side is the price per unit after the line discount,
since the catalog price is net of it too. That comes from the invoice once there
is one, and from the Rust order before that. Free text, lines without a price,
returns, credit notes, deposits, the fuel surcharge and corrections are left
out, and a replaced line is only held to its own product, since we never had a
price for the replacement. That's `src/lib/orders/prices.ts`.

An order is complete once every line is delivered, replaced or accepted. "Close"
ends the tracking of one that won't get there, like a cart that was never placed.

The Google Sheets export was imported once with
`npm run assortment:import -- <file.csv>` (skips ARCHIEF, order amounts start
at zero). That script refuses to run when the assortment already has data.

Items the supplier has no photo for can get an image of our own: the edit
form searches Open Food Facts and Open Products Facts (free product databases,
no key needed) using the supplier's product name, which works better than our
own short label. Pick a result and it is downloaded, resized and stored with
the item; a link can also be pasted. Setting `SERPER_API_KEY` adds a general image
search (Google results through [serper.dev](https://serper.dev), 2500 free
queries, no card) whose results are shown first, because they match the
product better than the databases do. Google's own Custom Search JSON API is
closed to new customers since 2026, so `GOOGLE_CSE_KEY`/`GOOGLE_CSE_ID` only
work for accounts that already had access. Repeated searches are cached for
15 minutes.

Every row in the catalog (`/catalog`, and the import detail pages) also has an
add button: pick an amount and it goes on a draft as a one-off, which becomes
the draft you carry on with. Adding the same product again raises the amount.
"Straight to Rust's cart" is the other way out, for what doesn't need following
up on: it goes into the supplier cart without showing up on any order.

## The item dialog

One dialog edits an item, wherever you open it. It has two sections:

- **Item**: name, order category (or a new one), target, the link to a catalog
  product (searchable, with images), image and note.
- **Pricing**: pricing category, VAT override, "not for sale", purchase price
  and where it was bought, contents and alcohol (readable from the supplier's
  description, like "24/20CL" or "FUST 20LT"), a live preview of the cost and
  advice, and the sale price history.

The order list opens it at Item, the pricing screen at Pricing, and an item's
own page has links to both. Archive, restore and delete are in its footer, and
archived items open from the Archived view on the order list. It loads what it
needs per item when it opens. The sale price itself is set in the pricing table.
Pricing also lists the composites an item goes into. A composite gets its own
version of the dialog; see [Composite products](#composite-products).

## Pricing

`/pricing` sets what we charge, on the same assortment items as the order
list. The model comes from the bar's old The model comes from the bar's old
"Prijsberekening" sheet (`src/lib/pricing/calc.ts`):

- **Cost per portion** = purchase price × (1 + VAT) ÷ (portions × (1 − loss)).
  The purchase price is Rust's catalog price (already net of the line
  discount) unless the item has a manual one; portions follow from the liters
  in a unit and in a portion, or are filled in directly for what isn't poured.
- **Advice**: the cost is marked up with the category's *base margin* while the
  price stays under its *pivot price*; the part of the cost above that only
  gets the lower *premium margin*, like tax brackets. Rounded to the setting
  (€ 0,10).
- **Price** is chosen by hand, inline in the table, with a button to take the
  advice. Every change is kept in `sale_price_changes`. Like the old sheet,
  it turns green when it is more than € 0,125 above the unrounded advice and
  red when it is that far below.

The table is grouped by order category, like the order page, with each row's
pricing category as a label. It also shows the portions bought this year
and last year, from the invoices.

*Calculator* tries a price for something that isn't in the assortment yet:
pick a pricing category, enter a purchase price and the contents (or paste a
supplier description to read them from), and it shows the cost per portion,
the advice with how it splits over the two margins, and what your own price
would earn. Nothing there is saved.

Pricing categories (margins, pivot price, loss, default VAT) and the settings
live under *Categories & settings*. Items bought elsewhere (the rotating
whisky) are added with *Other supplier item*: they get a manual purchase price
and also show on the order list, where the review lists them to order by hand.

Rows are flagged when Rust no longer lists the product (without a manual
price, the cost keeps using its last catalog price), data is missing, the price
is more than the tolerance (10%) below the advice, the margin is below the
premium margin, the cost per portion moved since the price was last saved (save
it again to accept), or 10 ml of alcohol is cheaper than in the reference drink
(Queer Beer).

### Composite products

Some things we sell are made of other items: a gin-tonic is a portion of gin
and a tonic. *Composite* on the pricing screen creates one. Its dialog takes a
name, the heading it's listed under, an image, a note and what goes in: items
from our own list with a quantity each (in portions, so 0,5 works). Only
products go in; not notes, and not other composites.

A composite is never ordered. It stays off the order list, so it never gets
on an order, into the cart, into order tracking or into purchase statistics.
It shows on the pricing screen, in the price list PDF and on its own item
page. In the database it's an `assortment_items` row with `kind` set to
`composite`. What goes into it lives in `composite_components`.

Its price is set in the table like any other. In place of the advice it shows
the **sum**: what its components sell for together, price × quantity. Its
cost and margin come from the components' cost per portion. The arrow next to
the price takes the sum. The calculation is in `src/lib/pricing/composite.ts`,
with its tests next to it. A composite gets flagged when:

- its price differs from the sum, by any amount (`€ 0,50 under sum`);
- the sum moved since its price was saved (`Sum up € 0,50`), which also says
  which component's price moved. Saving the price again, or the ✓, accepts it.
  Changing what goes in moves the sum too. For this, saving a price records
  the sum (`sale_price_reference`) and each component's price
  (`composite_components.reference_price`);
- the cost moved, as for any item;
- a component is archived. It still counts towards the sum, so either take it
  out or restore it;
- data is missing: no components, or a component without a price or cost.

The other side shows too. A product that goes into composites says so under
its name ("In Gin-tonic"). While you type a new price for it, a panel lists
what each of those composites' sums becomes. Their own prices stay put until
you change them, and in the meantime they show a moved sum. The item page
and the dialog list the composites an item goes into. An item that is in a
composite can't be deleted until it's taken out, but it can be archived.

The sheet was imported once with
`npm run pricing:import -- Prijsberekening.xlsx` (dry run; add `--apply` to
write). It matches rows to items by article number within the same heading,
then by name, skips ARCHIEF, prefers the alcohol percentage from the
supplier's description, and refuses to run once pricing categories exist.

## Item page

`/items/[id]` shows everything we know about one item on a single read-only
page, including archived items. Any screen that shows one of our items links to
it. A composite's page has just its components (with the price and cost of
each, and what they come to together) and its pricing. Any other item's page
has four sections:

- **Ordering**: target, what is on the list to buy, the order category and the
  note.
- **Pricing**: the sale price with its cost, advice and margin, the same flags
  as the pricing table, the composites it goes into, and the history of price
  changes.
- **Supplier**: catalog price, line discount and how the catalog price moved,
  with a warning when Rust no longer lists the product.
- **Purchases**: what a unit last cost us, plus every document the product
  appears on.

Changes happen on the order page and the pricing screen; the links in each
section's header lead there.

## Line discounts (regelkorting)

The supplier shows the line discount nowhere before ordering: the catalog JSON
has no discount fields and the cart quotes the full price. It appears as soon
as an order exists, in two places with the same shape:

| Source | Endpoint | When |
| --- | --- | --- |
| Open orders | `/Document/GetOrderDetails/<no>` | Right after ordering |
| Posted invoices | `/Document/GetPostedDocumentDetails/PostedInvoices/<no>` | Weeks later |
| Credit notes | `/Document/GetPostedDocumentDetails/PostedCreditMemos/<no>` | With a refund |

Both carry `Line_Discount_Percent` and `Amount` (the "regeltotaal", net of the
discount). **Import invoices & orders** on the imports page reads invoices
(newest first, in batches, continuing where it left off) and re-reads the open
orders every run, since those still change. An order that has been invoiced
drops out of the open list and its rows are removed, leaving the invoice as
the authority.

The discount shown per product is the one on its most recent line, whether
that is an open order or an invoice. Credit notes don't count.
Products we never ordered stay "unknown". Note that the catalog price is the
price *after* this discount: comparing recent invoices with the catalog, the
catalog matches the net price and never the gross. The discount therefore says
where we have an agreement, not that something extra comes off at checkout.
The discount per unit stays constant while the percentage moves with the
price.

`npm run supplier:invoices -- --batch 250` does the same from the command line.
Both document endpoints answer with an error unless their own page has been
loaded in the same session first, which the service handles.

## Rust Financials

Everything that comes from Rust Food's own bookkeeping sits behind one nav
entry, since it is secondary to ordering: purchase history, invoices,
orders, what is outstanding and the deposit balance.

The section header says when the documents last synced, with the import button
right there, so you can check and top them up from the pages that use the data.
(It is also still on the imports page.)

`/financials/invoices` lists the posted invoices and credit notes, searchable
by document number or by what is on them (searching "fireball" gives every
invoice that product is on). *Placed orders* (`/financials/orders`) does the same for orders
that have not been invoiced yet. Both open a document page with all its
lines, the discount per line, what the discount saved and the total, both
excluding and including VAT; item numbers link through to the catalog. An
order also says when it is promised, and an invoice which order it came
from — the supplier only names that while the invoice is unpaid, so older
invoices do not have it.

An invoice or credit note also has its original PDF, one click from the
document page and from the outstanding list. The supplier only hands it to a
logged-in session, so it comes through `/api/documents/<number>` with ours.
Orders have no PDF until they are invoiced.

### Outstanding

`/financials/outstanding` is the supplier's own list of what is still unpaid
("openstaande posten"): invoices waiting to be paid, plus credit notes that
have not been settled against them, with what it adds up to and what is past
its due date. Amounts include VAT, unlike everywhere else. The list is
replaced on every document import, since entries simply disappear once they
are paid. Anything overdue also shows next to the section header, so you
notice it from any of these pages.

### Purchase History

`/financials/purchase-history` totals what we bought per year from the imported invoices and
credit notes: number of invoices, products, units and the amount, plus the
date of the last invoice in that year so you can tell whether a year is
complete. Picking a year lists its products with units, the average unit price plus what
a unit cost on the first and the last document of that year (so you can see
which way it moved), the line discount on the last document of that year
(with how it moved since the first one) and when it was last bought. Prices are what we actually paid, net of the
discount. Any
of those columns sorts the list; it opens on spend, highest first.

Clicking a product opens every document it appears on, with the quantity,
price, discount and line total per document. Documents where the price or the
discount moved against the one before are highlighted, with an arrow on the
figure that changed, so the handful of moments that matter stand out. It opens on the selected year and switches to all
years in one click. Document numbers link straight to the invoice.

Credit notes count against the totals. Orders that are not invoiced yet are
left out, so a recent order only shows up once its invoice arrives. Deposits
on crates and kegs ("emballage") are excluded by default, with a toggle to
count them and a column showing what they came to. Amounts exclude VAT.

### Deposits

`/financials/deposits` shows the kegs, CO₂ cylinders, crates, cans and bottles
we paid deposit ("emballage") on and haven't handed back yet. Per type, and per
deposit item within it, it gives the units charged, returned and still out,
what that comes to, and when the item last appeared. A chart shows how the
money balance moved, from the start, over 3 years or over 12 months.

Every invoice line with `EMBALLAGE` in its description is a deposit. On an
invoice a positive quantity is charged and a negative one is a return. A credit
note refunds with a positive quantity, the way Rust refunds a pile of kegs at
once, and a negative line there counts as charged again. Rust's descriptions
only give the amount ("EMBALLAGE EURO 30,00"), so the type of each item number
(8856 is a € 30 beer keg, 8820 a € 120 CO₂ cylinder, 8886 a € 3,90 beer
crate, 8891 a € 5 soft drink crate, and so on) comes from the product lines
those deposits follow on the invoices. An item number that isn't listed shows
under Other with its price.

The balance counts from the first imported document, so anything out before
then is unknown and a type can come out below zero. Soft drink crates do: far
more have come back than were charged since 2018. Can deposit is charged but
hardly ever comes back through Rust. Open orders aren't included until they are
invoiced. Amounts exclude VAT. The calculation is in
`src/lib/products/deposits.ts`, with its tests next to it.

## Supplier import

The supplier webshop (DIN Online, `b2b-rustfood.dinonline.nl`) has no API. The
import logs in like a browser (`src/lib/supplier/auth-service.ts`) and pages
through the catalog's DataTables endpoint (`src/lib/supplier/catalog-service.ts`),
1000 rows per request.

[`docs/dinonline-portal.md`](docs/dinonline-portal.md) is the reference for
that portal: how the session works, every endpoint we know of with its
fields, the quirks (a JSON endpoint answers 500 unless its own page was
loaded first) and what we deliberately leave alone. Read it before building
anything that talks to the supplier.

Each import records which products are new, which prices changed and which
products disappeared from the catalog. Products are never deleted, only marked
removed. Partial imports (a row limit or an unreadable row) never mark anything
removed. An import's page marks the products on our own list and can narrow to
just those.

Catalog and document imports share one run log (`supplier_imports`, shown on
`/imports`), with a guard and a stale-run timeout per kind. They stay separate
requests, because the catalog alone takes most of the hosting time limit.
Refreshing open orders and the outstanding list fetches everything first and
writes in one batch, so a failure leaves the old rows in place.

| Command | |
| --- | --- |
| `npm run supplier:import` | Same as the button |
| `npm run supplier:import -- --limit 50` | Only the first 50 rows, for testing |
| `npm run supplier:probe -- 5 [start]` | Dump a few raw rows to `data/probe.json` |

`SUPPLIER_IMPORT_LIMIT` and `SUPPLIER_PAGE_SIZE` in `.env` also cap the button's import.

## Product images

The supplier only serves images to a logged-in session, so they are proxied
through `/api/product-images/[itemNo]` and cached in the database (a small
webp thumbnail plus the original). Requests never wait on the supplier: an image that
isn't cached yet gets a `202` while it is fetched in the background, and the
page picks it up on a retry. Products the supplier has no image for are
recorded in the database and render an icon without any request.

Both the thumbnail and the larger version are re-encoded to webp before they
are stored (96px and 500px), because the large one only feeds a 256px preview:
roughly 10 KB per product instead of the 250 KB PNG the supplier serves. Our
own images are resized the same way on download.

| Command | |
| --- | --- |
| `npm run supplier:images` | Pre-fetch images for our assortment (4 at a time) |
| `npm run supplier:images -- --catalog` | The whole catalog, ~33 MB of database |
| `npm run images:compact` | Report on oversized cached images; `-- --apply` rewrites them |

## Deploying to Vercel

The app is prepared for Vercel: pages that read the database render per
request, both imports and the cart calls get `maxDuration = 60`, product
images are cached in the database instead of on disk (serverless has no
persistent filesystem), and background image fetching uses `after()` so it
survives the response.

Access is protected by HTTP basic auth in `src/proxy.ts`: set `APP_PASSWORD`
and the browser asks for it once. Without that variable the app is open, which
is fine locally but never when hosted.

1. Create a database at [turso.tech](https://turso.tech) and copy its URL
   (`libsql://…`) plus an auth token.
2. Point your local `.env` at it temporarily and run `npm run db:migrate` to
   create the tables there.
3. Push this repository to GitHub and import it in Vercel.
4. Set the environment variables in Vercel: `SUPPLIER_USERNAME`,
   `SUPPLIER_PASSWORD`, `APP_PASSWORD`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.
5. Deploy, open the app, log in and press **Import products**.

Migrations are not run automatically; after a schema change run
`npm run db:migrate` with the Turso variables in your environment.

## Database

SQLite through libSQL + Drizzle, stored in `data/app.db`. For hosting, point
`DATABASE_URL`/`DATABASE_AUTH_TOKEN` at a Turso database; no code changes
needed. Cached images live in the database too, so a fully warmed catalog adds
roughly 150–200 MB.

| Command | |
| --- | --- |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |

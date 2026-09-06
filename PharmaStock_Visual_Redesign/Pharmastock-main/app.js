let meds = [], cart = [];

const $ = id => document.getElementById(id);

/* ============================================================
   BANGLADESH TIME
   ============================================================ */

const BD_TIMEZONE = "Asia/Dhaka";

/*
   Get today's date according to Bangladesh time.
   Returns YYYY-MM-DD.
*/
function bdToday() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: BD_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

/*
   Check whether an expiry date has already passed
   according to Bangladesh date.
*/
function isExpired(expiry) {
    if (!expiry) return false;

    // PostgreSQL DATE normally arrives as YYYY-MM-DD.
    return String(expiry).slice(0, 10) < bdToday();
}

/*
   Format a timestamp in Bangladesh time.
*/
function formatBDDateTime(value) {
    if (!value) return "—";

    const d = new Date(value);

    if (isNaN(d.getTime())) {
        return String(value).replace("T", " ");
    }

    return new Intl.DateTimeFormat("en-GB", {
        timeZone: BD_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    }).format(d);
}


/* ============================================================
   MONEY
   ============================================================ */

function money(n) {
    return "৳" + Number(n || 0).toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


/* ============================================================
   PAGE NAVIGATION
   ============================================================ */

function show(id, btn) {

    document.querySelectorAll(".page")
        .forEach(x => x.classList.add("hidden"));

    $(id).classList.remove("hidden");

    document.querySelectorAll(".nav")
        .forEach(x => x.classList.remove("active"));

    if (btn) btn.classList.add("active");

    $("title").textContent = {
        dashboard: "Dashboard",
        inventory: "Medicines",
        sales: "Sales & Billing",
        purchase: "Purchases",
        reports: "Reports"
    }[id];

    if (id === "dashboard") loadDash();

    if (id === "inventory") loadMeds();

    if (id === "sales") {
        loadMeds();
        renderCart();
    }

    if (id === "purchase") loadMeds();

    if (id === "reports") loadReports();
}


/* ============================================================
   DASHBOARD
   ============================================================ */

async function loadDash() {

    let d = await (
        await fetch("/api/dashboard")
    ).json();

    $("products").textContent = d.total_products;

    $("stock").textContent = d.stock;

    $("value").textContent = money(d.value);

    $("low").textContent = d.low;

    $("expired").textContent = d.expired;

    $("today").textContent = money(d.today);
}


/* ============================================================
   MEDICINES
   ============================================================ */

async function loadMeds() {

    meds = await (
        await fetch(
            "/api/medicines?q=" +
            encodeURIComponent(
                $("search")?.value || ""
            )
        )
    ).json();

    let rows = meds.map(m => {

        /*
           IMPORTANT:
           Expiry is now compared against Bangladesh's date.
        */
        let ex = isExpired(m.expiry);

        let low = m.stock <= m.min_stock;

        return `
            <tr>
                <td>
                    <b>${esc(m.name)}</b>
                    <br>
                    <small>${esc(m.generic || "")}</small>
                </td>

                <td>
                    ${esc(m.company || "")}
                </td>

                <td>
                    ${esc(m.batch || "")}
                </td>

                <td class="${ex ? "expired" : ""}">
                    ${m.expiry || "—"}
                </td>

                <td>
                    ${money(m.purchase)}
                </td>

                <td>
                    ${money(m.price)}
                </td>

                <td class="${low ? "stocklow" : ""}">
                    ${m.stock}
                </td>

                <td>
                    <button onclick='openMed(${JSON.stringify(m)})'>
                        Edit
                    </button>

                    <button onclick='delMed(${m.id})'>
                        Delete
                    </button>
                </td>
            </tr>
        `;

    }).join("");

    if ($("medrows")) {

        $("medrows").innerHTML =
            rows ||
            '<tr><td colspan="8">No medicines found.</td></tr>';
    }

    fillSelects();
}


/* ============================================================
   SELECT BOXES
   ============================================================ */

function fillSelects() {

    let opts = meds.map(m => `
        <option value="${m.id}">
            ${esc(m.name)} — ${m.stock} in stock
        </option>
    `).join("");

    if ($("saleMed"))
        $("saleMed").innerHTML = opts;

    if ($("purMed"))
        $("purMed").innerHTML = opts;
}


/* ============================================================
   HTML ESCAPE
   ============================================================ */

function esc(s) {

    return String(s ?? "").replace(
        /[&<>"']/g,
        x => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[x])
    );
}


/* ============================================================
   MEDICINE MODAL
   ============================================================ */

function openMed(m = null) {

    $("modal").classList.remove("hidden");

    $("mid").value = m?.id || "";

    [
        "name",
        "generic",
        "company",
        "category",
        "batch",
        "expiry"
    ].forEach(k => {
        $(k).value = m?.[k] || "";
    });

    $("purchase").value = m?.purchase || "";

    $("price").value = m?.price || "";

    $("medstock").value = m?.stock ?? "";

    $("minstock").value = m?.min_stock ?? 10;

    $("modalTitle").textContent =
        m ? "Edit Medicine" : "Add Medicine";
}


function closeMed() {

    $("modal").classList.add("hidden");
}


/* ============================================================
   SAVE MEDICINE
   ============================================================ */

async function saveMed() {

    let d = {
        name: $("name").value,
        generic: $("generic").value,
        company: $("company").value,
        category: $("category").value,
        batch: $("batch").value,
        expiry: $("expiry").value,
        purchase: $("purchase").value,
        price: $("price").value,
        stock: $("medstock").value,
        min_stock: $("minstock").value
    };

    let id = $("mid").value;

    let r = await fetch(
        id
            ? "/api/medicines/" + id
            : "/api/medicines",
        {
            method: id ? "PUT" : "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(d)
        }
    );

    let j = await r.json();

    if (!r.ok) {

        $("medMsg").innerHTML =
            `<div class="msg error">
                ${esc(j.error)}
            </div>`;

        return;
    }

    closeMed();

    loadMeds();

    loadDash();
}


/* ============================================================
   DELETE MEDICINE
   ============================================================ */

async function delMed(id) {

    if (!confirm("Delete this medicine?"))
        return;

    await fetch(
        "/api/medicines/" + id,
        {
            method: "DELETE"
        }
    );

    loadMeds();

    loadDash();
}


/* ============================================================
   CART
   ============================================================ */

function addCart() {

    let id = +$("saleMed").value;

    let qty = +$("saleQty").value;

    let m = meds.find(
        x => x.id === id
    );

    if (!m || qty < 1)
        return;

    let old = cart.find(
        x => x.id === id
    );

    if (old)
        old.qty += qty;
    else
        cart.push({
            id,
            qty,
            name: m.name,
            price: m.price
        });

    renderCart();
}


function renderCart() {

    $("cart").innerHTML =
        cart.map((x, i) => `
            <div class="cartitem">

                <span>
                    ${esc(x.name)} × ${x.qty}
                </span>

                <span>
                    ${money(x.price * x.qty)}

                    <button
                        onclick="cart.splice(${i},1);renderCart()">
                        ×
                    </button>
                </span>

            </div>
        `).join("")
        ||
        '<p class="muted">Cart is empty.</p>';

    $("cartTotal").textContent =
        money(
            cart.reduce(
                (s, x) =>
                    s + x.price * x.qty,
                0
            )
        );
}


/* ============================================================
   COMPLETE SALE
   ============================================================ */

async function completeSale() {

    if (!cart.length)
        return alert("Cart is empty.");

    let r = await fetch(
        "/api/sales",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                customer:
                    $("customer").value,

                items:
                    cart.map(
                        x => ({
                            id: x.id,
                            qty: x.qty
                        })
                    )
            })
        }
    );

    let j = await r.json();

    if (!r.ok) {

        $("saleMsg").innerHTML =
            `<div class="msg error">
                ${esc(j.error)}
            </div>`;

        return;
    }

    /*
       Sale timestamp comes from the server,
       which is now Bangladesh time.
    */

    $("saleMsg").innerHTML =
        `<div class="msg">
            Sale completed.
            Invoice:
            <b>${esc(j.invoice)}</b>
            —
            ${money(j.total)}
            <br>
            <small>
                ${esc(j.datetime || "")}
                (Bangladesh time)
            </small>
        </div>`;

    cart = [];

    $("customer").value = "";

    renderCart();

    loadMeds();

    loadDash();
}


/* ============================================================
   PURCHASE / STOCK-IN
   ============================================================ */

async function addPurchase() {

    let d = {
        medicine_id:
            $("purMed").value,

        supplier:
            $("supplier").value,

        batch:
            $("purBatch").value,

        expiry:
            $("purExpiry").value,

        quantity:
            $("purQty").value,

        purchase_price:
            $("purPrice").value
    };

    let r = await fetch(
        "/api/purchases",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(d)
        }
    );

    let j = await r.json();

    $("purMsg").innerHTML =
        `<div class="msg ${r.ok ? "" : "error"}">
            ${
                r.ok
                    ? "Stock added successfully."
                    : esc(j.error)
            }
        </div>`;

    if (r.ok) {

        $("purQty").value = "";

        loadMeds();

        loadDash();
    }
}


/* ============================================================
   REPORTS
   ============================================================ */

async function loadReports() {

    let s = await (
        await fetch("/api/reports/sales")
    ).json();

    let st = await (
        await fetch("/api/reports/stock")
    ).json();


    /* ---------------- SALES REPORT ---------------- */

    $("salesReport").innerHTML =
        s.length
            ? `
                <table>

                    <tr>
                        <th>Invoice</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Date</th>
                    </tr>

                    ${
                        s.map(x => `
                            <tr>

                                <td>
                                    ${esc(x.invoice)}
                                </td>

                                <td>
                                    ${esc(x.customer)}
                                </td>

                                <td>
                                    ${money(x.total)}
                                </td>

                                <td>
                                    ${formatBDDateTime(
                                        x.created_at
                                    )}
                                </td>

                            </tr>
                        `).join("")
                    }

                </table>
            `
            : "No sales yet.";


    /* ---------------- STOCK / EXPIRY REPORT ---------------- */

    $("stockReport").innerHTML =
        st.length
            ? `
                <table>

                    <tr>
                        <th>Medicine</th>
                        <th>Stock</th>
                        <th>Expiry</th>
                    </tr>

                    ${
                        st.map(x => `
                            <tr>

                                <td>
                                    ${esc(x.name)}
                                </td>

                                <td class="${
                                    x.stock <= x.min_stock
                                        ? "stocklow"
                                        : ""
                                }">
                                    ${x.stock}
                                </td>

                                <td class="${
                                    isExpired(x.expiry)
                                        ? "expired"
                                        : ""
                                }">
                                    ${x.expiry || "—"}
                                </td>

                            </tr>
                        `).join("")
                    }

                </table>
            `
            : "No alerts.";
}


/* ============================================================
   INITIAL LOAD
   ============================================================ */

loadDash();

loadMeds();

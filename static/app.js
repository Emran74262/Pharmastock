let meds = [];
let cart = [];
let currentUser = null;

const $ = id => document.getElementById(id);

function money(n) {
  return "৳" + Number(n || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, x => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[x]));
}

/* =========================
   LOGIN / SESSION
========================= */

async function checkSession() {
  try {
    const r = await fetch("/api/me");
    const data = await r.json();

   if (r.ok && data.logged_in) {
      currentUser = {
  username: data.username,
  role: data.role
};
      showApp();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  if ($("loginPage")) $("loginPage").classList.remove("hidden");
  if ($("app")) $("app").classList.add("hidden");
}

function showApp() {
  if ($("loginPage")) $("loginPage").classList.add("hidden");
  if ($("app")) $("app").classList.remove("hidden");

  if ($("loggedUser")) {
    $("loggedUser").textContent =
      currentUser?.username || "User";
  }

  if ($("userRole")) {
    $("userRole").textContent =
      currentUser?.role || "";
  }

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display =
      currentUser?.role === "admin" ? "" : "none";
  });

  loadDash();
  loadMeds();
}

async function login() {
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    $("loginMsg").innerHTML =
      '<div class="msg error">Enter username and password.</div>';
    return;
  }

  $("loginMsg").innerHTML =
    '<div class="msg">Logging in...</div>';

  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    const data = await r.json();

    if (!r.ok) {
      $("loginMsg").innerHTML =
        `<div class="msg error">${esc(data.error || "Login failed.")}</div>`;
      return;
    }

    currentUser = data.user;

    $("loginPassword").value = "";

    showApp();

  } catch (e) {
    $("loginMsg").innerHTML =
      '<div class="msg error">Could not connect to the server.</div>';
    console.error(e);
  }
}

async function logout() {
  try {
    await fetch("/api/logout", {
      method: "POST"
    });
  } catch (e) {
    console.error(e);
  }

  currentUser = null;
  cart = [];

  showLogin();
}

/* =========================
   NAVIGATION
========================= */

function show(id, btn) {
  document.querySelectorAll(".page").forEach(x =>
    x.classList.add("hidden")
  );

  const page = $(id);
  if (page) page.classList.remove("hidden");

  document.querySelectorAll(".nav").forEach(x =>
    x.classList.remove("active")
  );

  if (btn) btn.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    inventory: "Medicines",
    sales: "Sales & Billing",
    purchase: "Stock In",
    movements: "Stock History",
    reports: "Reports",
    users: "Users",
    backup: "Backup"
  };

  if ($("title")) {
    $("title").textContent = titles[id] || "PharmaStock";
  }

  if (id === "dashboard") loadDash();
  if (id === "inventory") loadMeds();
  if (id === "sales") {
    loadMeds();
    renderCart();
  }
  if (id === "purchase") loadMeds();
  if (id === "movements") loadMovements();
  if (id === "reports") loadReports();
  if (id === "users") loadUsers();
}

/* =========================
   BANGLADESH TIME
========================= */

function updateClock() {
  const now = new Date();

  const time = new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(now);

  const date = new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(now);

  if ($("bdClockDate")) {
    $("bdClockDate").textContent = `Date : ${date}`;
  }

  if ($("bdClockTime")) {
    $("bdClockTime").textContent = `Time : ${time}`;
  }

  if ($("bdClock")) {
    $("bdClock").textContent = `Date : ${date} | Time : ${time}`;
  }

  if ($("currentTime")) {
    $("currentTime").textContent = `Date : ${date} | Time : ${time}`;
  }
}

setInterval(updateClock, 1000);

/* =========================
   DASHBOARD
========================= */

async function loadDash() {
  try {
    const r = await fetch("/api/dashboard");

    if (r.status === 401) {
      showLogin();
      return;
    }

    const d = await r.json();

    if ($("products")) $("products").textContent = d.total_products || 0;
    if ($("stock")) $("stock").textContent = d.stock || 0;
    if ($("value")) $("value").textContent = money(d.value);
    if ($("low")) $("low").textContent = d.low || 0;
    if ($("expired")) $("expired").textContent = d.expired || 0;
    if ($("today")) $("today").textContent = money(d.today);

    if ($("nearExpiry")) {
      $("nearExpiry").textContent = d.near_expiry || 0;
    }

    if ($("dashboardTime")) {
      $("dashboardTime").textContent =
        new Intl.DateTimeFormat("en-BD", {
          timeZone: "Asia/Dhaka",
          dateStyle: "medium",
          timeStyle: "medium"
        }).format(new Date());
    }

    if ($("dashboardAlerts")) {
      let alerts = [];

      if (d.low > 0)
        alerts.push(`⚠️ ${d.low} medicine(s) have low stock.`);

      if (d.expired > 0)
        alerts.push(`🔴 ${d.expired} medicine(s) are expired.`);

      if (d.near_expiry > 0)
        alerts.push(`🟠 ${d.near_expiry} medicine(s) are near expiry.`);

      $("dashboardAlerts").innerHTML =
        alerts.length
          ? alerts.map(x => `<div class="msg">${x}</div>`).join("")
          : '<div class="msg">✓ No stock alerts.</div>';
    }

  } catch (e) {
    console.error("Dashboard error:", e);
  }
}

/* =========================
   MEDICINES
========================= */

function normalizeDateInput(value) {
  if (!value) return "";
  const s = String(value);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

function formatDateBD(value) {
  const iso = normalizeDateInput(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function loadMeds() {
  try {
    const search = $("search")?.value || "";

    const r = await fetch(
      "/api/medicines?q=" + encodeURIComponent(search)
    );

    if (r.status === 401) {
      showLogin();
      return;
    }

    meds = await r.json();

    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    let rows = meds.map(m => {

      const expiryIso = normalizeDateInput(m.expiry);
      const ex = expiryIso && expiryIso < todayIso;
      const low = Number(m.stock) <= Number(m.min_stock);

      return `
        <tr>
          <td>
            <b>${esc(m.name)}</b>
            <br>
            <small>${esc(m.generic || "")}</small>
          </td>

          <td>${esc(m.company || "")}</td>

          <td>${esc(m.batch || "")}</td>

          <td class="${ex ? "expired" : ""}">
            ${formatDateBD(m.expiry)}
          </td>

          <td>${money(m.purchase)}</td>

          <td>${money(m.price)}</td>

          <td class="${low ? "stocklow" : ""}">
            ${m.stock}
          </td>

          <td>
            <button onclick='openMed(${JSON.stringify(m)})'>
              Edit
            </button>

            <button onclick="delMed(${m.id})">
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

  } catch (e) {
    console.error("Medicine loading error:", e);
  }
}

function fillSelects() {

  const opts = meds.map(m =>
    `<option value="${m.id}">
      ${esc(m.name)} — ${m.stock} in stock
    </option>`
  ).join("");

  if ($("saleMed"))
    $("saleMed").innerHTML = `<option value=""></option>${opts}`;

  if ($("purMed"))
    $("purMed").innerHTML = `<option value=""></option>${opts}`;
}

function openMed(m = null) {

  if (!$("modal")) return;

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
    if ($(k)) {
      $(k).value = k === "expiry"
        ? normalizeDateInput(m?.[k])
        : (m?.[k] || "");
    }
  });

  if ($("purchase"))
    $("purchase").value = m?.purchase ?? "";

  if ($("price"))
    $("price").value = m?.price ?? "";

  if ($("medstock"))
    $("medstock").value = m?.stock ?? "";

  if ($("minstock"))
    $("minstock").value = m?.min_stock ?? "";

  if ($("modalTitle"))
    $("modalTitle").textContent =
      m ? "Edit Medicine" : "Add Medicine";
}

function closeMed() {
  if ($("modal"))
    $("modal").classList.add("hidden");
}

async function saveMed() {

  const d = {
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

  const id = $("mid").value;

  try {

    const r = await fetch(
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

    const j = await r.json();

    if (!r.ok) {
      $("medMsg").innerHTML =
        `<div class="msg error">${esc(j.error || "Error saving medicine.")}</div>`;
      return;
    }

    closeMed();
    loadMeds();
    loadDash();

  } catch (e) {
    $("medMsg").innerHTML =
      '<div class="msg error">Server error.</div>';
  }
}

async function delMed(id) {

  if (!confirm("Delete this medicine?"))
    return;

  try {

    const r = await fetch(
      "/api/medicines/" + id,
      {
        method: "DELETE"
      }
    );

    const j = await r.json();

    if (!r.ok) {
      alert(j.error || "Could not delete medicine.");
      return;
    }

    loadMeds();
    loadDash();

  } catch (e) {
    alert("Server error.");
  }
}

/* =========================
   SALES
========================= */

function addCart() {

  const id = +$("saleMed").value;
  const qty = +$("saleQty").value;

  const m = meds.find(x => x.id === id);

  if (!m || qty < 1)
    return;

  if (qty > Number(m.stock)) {
    alert(`Only ${m.stock} units available.`);
    return;
  }

  const old = cart.find(x => x.id === id);

  if (old) {

    if (old.qty + qty > Number(m.stock)) {
      alert(`Only ${m.stock} units available.`);
      return;
    }

    old.qty += qty;

  } else {

    cart.push({
      id,
      qty,
      name: m.name,
      price: Number(m.price || 0)
    });
  }

  renderCart();
}

function renderCart() {

  if (!$("cart")) return;

  $("cart").innerHTML =
    cart.map((x, i) => `
      <div class="cartitem">
        <span>
          ${esc(x.name)} × ${x.qty}
        </span>

        <span>
          ${money(x.price * x.qty)}

          <button onclick="cart.splice(${i},1);renderCart()">
            ×
          </button>
        </span>
      </div>
    `).join("") ||
    '<p class="muted">Cart is empty.</p>';

  const subtotal =
    cart.reduce(
      (s, x) => s + x.price * x.qty,
      0
    );

  const discountPercent = Math.max(0, Math.min(100, Number($("discount")?.value || 0)));
  const discountAmount = subtotal * discountPercent / 100;
  const total = Math.max(0, subtotal - discountAmount);

  if ($("cartSubtotal"))
    $("cartSubtotal").textContent = money(subtotal);

  if ($("cartDiscount"))
    $("cartDiscount").textContent = money(discountAmount);

  if ($("cartTotal"))
    $("cartTotal").textContent = money(total);
}

async function completeSale() {

  if (!cart.length) {
    alert("Cart is empty.");
    return;
  }

  const discountPercent = Math.max(0, Math.min(100, Number($("discount")?.value || 0)));
  const subtotal = cart.reduce((sum, x) => sum + x.price * x.qty, 0);
  const discount = subtotal * discountPercent / 100;

  const customer =
    $("customer")?.value || "";

  try {

    const r = await fetch("/api/sales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customer,
        discount,
        items: cart.map(x => ({
          id: x.id,
          qty: x.qty
        }))
      })
    });

    const j = await r.json();

    if (!r.ok) {

      $("saleMsg").innerHTML =
        `<div class="msg error">${esc(j.error || "Sale failed.")}</div>`;

      return;
    }

    $("saleMsg").innerHTML = `
      <div class="msg">
        Sale completed successfully.
        <br>
        Invoice:
        <b>${esc(j.invoice)}</b>
        —
        ${money(j.total)}
        <br><br>

        <button onclick="printInvoice('${esc(j.invoice)}')">
          🖨️ Print Invoice
        </button>
      </div>
    `;

    cart = [];

    if ($("customer"))
      $("customer").value = "";

    if ($("discount"))
      $("discount").value = "";

    if ($("saleQty"))
      $("saleQty").value = "";

    if ($("saleMed"))
      $("saleMed").value = "";

    renderCart();
    loadMeds();
    loadDash();

  } catch (e) {

    $("saleMsg").innerHTML =
      '<div class="msg error">Server error while completing sale.</div>';

    console.error(e);
  }
}

/* =========================
   PRINT INVOICE
========================= */

async function printInvoice(invoice) {
  try {
    const r = await fetch("/api/sales/" + encodeURIComponent(invoice));
    if (!r.ok) {
      alert("Invoice information could not be loaded.");
      return;
    }

    const data = await r.json();
    const sale = data.sale || {};
    const items = data.items || [];

    const calculatedSubtotal = items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);

    const invoiceSubtotal = Number(sale.subtotal || 0) || calculatedSubtotal;
    const invoiceDiscount = Number(sale.discount || 0);
    const invoiceDiscountPercent = invoiceSubtotal > 0 ? (invoiceDiscount / invoiceSubtotal) * 100 : 0;
    const invoiceTotal = Number(sale.total || 0) || Math.max(0, invoiceSubtotal - invoiceDiscount);

    const rows = items.map(item => {
      const lineTotal = Number(item.quantity || 0) * Number(item.price || 0);
      const expiry = item.expiry ? new Date(item.expiry).toLocaleDateString("en-GB") : "—";
      return `
        <tr>
          <td>
            <strong>${esc(item.name)}</strong>
            ${item.generic ? `<div class="sub">${esc(item.generic)}</div>` : ""}
          </td>
          <td>${esc(item.batch || "—")}</td>
          <td>${expiry}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.price)}</td>
          <td class="num"><strong>${money(lineTotal)}</strong></td>
        </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=900,height=800");
    if (!win) {
      alert("Please allow pop-ups to print the invoice.");
      return;
    }

    let invoiceDate = "";
    let invoiceTime = "";
    if (sale.created_at) {
      const raw = String(sale.created_at).replace("T", " ");
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        const [, y, mo, d, hh, mm, ss = "00"] = match;
        const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
        invoiceDate = new Intl.DateTimeFormat("en-GB", {
          day: "2-digit", month: "long", year: "numeric"
        }).format(dt);
        invoiceTime = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: true
        }).format(dt);
      } else {
        const dt = new Date(sale.created_at);
        if (!Number.isNaN(dt.getTime())) {
          invoiceDate = new Intl.DateTimeFormat("en-GB", {
            day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dhaka"
          }).format(dt);
          invoiceTime = new Intl.DateTimeFormat("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka"
          }).format(dt);
        }
      }
    }

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${esc(invoice)} — PharmaStock</title>
        <style>
          *{box-sizing:border-box}
          body{margin:0;background:#eef3f6;font-family:Arial,Segoe UI,sans-serif;color:#163047}
          .invoice{width:min(900px,calc(100% - 30px));margin:25px auto;background:#fff;padding:38px;box-shadow:0 12px 40px rgba(0,0,0,.10)}
          .top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1aa765;padding-bottom:22px}
          .brand{font-size:28px;font-weight:800;color:#087b43}.brand span{font-size:30px}
          .tag{margin-top:5px;color:#6b7c93;font-size:13px}
          .invoice-title{text-align:right}.invoice-title h1{margin:0;font-size:28px;color:#102a43}.invoice-title p{margin:7px 0;color:#6b7c93;font-size:12px}
          .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0;padding:15px;background:#f6faf8;border-radius:12px}
          .meta b{display:block;font-size:11px;text-transform:uppercase;color:#78909c;margin-bottom:4px}.meta span{font-size:14px}
          table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#0b8f52;color:#fff;text-align:left;padding:11px 9px;font-size:11px;text-transform:uppercase}td{padding:11px 9px;border-bottom:1px solid #e5ebef;font-size:12px}.sub{color:#718096;font-size:10px;margin-top:3px}.num{text-align:right}
          .totals{margin:20px 0 0 auto;width:310px}.line{display:flex;justify-content:space-between;padding:7px 0;color:#66788a}.grand{display:flex;justify-content:space-between;margin-top:8px;padding-top:13px;border-top:2px solid #dce7e2;font-size:19px;font-weight:800;color:#087b43}
          .footer{margin-top:28px;padding-top:18px;border-top:1px solid #e3e9ed;text-align:center;color:#718096;font-size:11px}.print{margin-top:22px;text-align:center}.print button{border:0;border-radius:9px;background:#0b8f52;color:white;padding:11px 22px;font-weight:700;cursor:pointer}
          @media print{body{background:#fff}.invoice{width:100%;margin:0;padding:18px;box-shadow:none}.print{display:none}}
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="top">
            <div><div class="brand"><span>💊</span> PharmaStock</div><div class="tag">Professional Pharmacy Management</div></div>
            <div class="invoice-title"><h1>SALES INVOICE</h1><p>Original Customer Copy</p></div>
          </div>

          <div class="meta">
            <div><b>Invoice Number</b><span>${esc(invoice)}</span></div>
            <div><b>Date</b><span>${esc(invoiceDate || "—")}</span></div>
            <div><b>Time</b><span>${esc(invoiceTime || "—")}</span></div>
            <div><b>Customer</b><span>${esc(sale.customer || "Walk-in Customer")}</span></div>
            <div><b>Payment</b><span>Cash / Counter Sale</span></div>
          </div>

          <table>
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="totals">
            <div class="line"><span>Subtotal</span><strong>${money(invoiceSubtotal)}</strong></div>
            <div class="line"><span>Discount (${invoiceDiscountPercent.toFixed(2)}%)</span><strong>− ${money(invoiceDiscount)}</strong></div>
            <div class="grand"><span>Grand Total</span><span>${money(invoiceTotal)}</span></div>
          </div>

          <div class="footer">Thank you for choosing PharmaStock.<br>Please keep this invoice for your records.</div>
          <div class="print"><button onclick="window.print()">🖨️ Print Invoice</button></div>
        </div>
      </body>
      </html>`);
    win.document.close();
  } catch (e) {
    console.error(e);
    alert("Could not open invoice.");
  }
}
/* =========================
   STOCK IN
========================= */

async function addPurchase() {

  const d = {
    medicine_id: $("purMed").value,
    supplier: $("supplier").value,
    batch: $("purBatch").value,
    expiry: $("purExpiry").value,
    quantity: $("purQty").value,
    purchase_price: $("purPrice").value
  };

  try {

    const r = await fetch("/api/purchases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(d)
    });

    const j = await r.json();

    $("purMsg").innerHTML =
      `<div class="msg ${r.ok ? "" : "error"}">
        ${r.ok
          ? "Stock added successfully."
          : esc(j.error || "Could not add stock.")}
      </div>`;

    if (r.ok) {

      $("purQty").value = "";

      loadMeds();
      loadDash();
      loadMovements();
    }

  } catch (e) {

    $("purMsg").innerHTML =
      '<div class="msg error">Server error.</div>';
  }
}

/* =========================
   STOCK HISTORY
========================= */

async function loadMovements() {

  if (!$("movementRows"))
    return;

  try {

    const r = await fetch("/api/movements");

    if (!r.ok) {
      $("movementRows").innerHTML =
        '<tr><td colspan="7">Could not load stock history.</td></tr>';
      return;
    }

    const data = await r.json();

    $("movementRows").innerHTML =
      data.length
        ? data.map(x => `
          <tr>
            <td>${esc(x.medicine_name || "")}</td>
            <td>${esc(x.type || "")}</td>
            <td>${x.quantity || 0}</td>
            <td>${esc(x.reference || "")}</td>
            <td>${esc(x.user || "")}</td>
            <td>${esc(x.created_at || "")}</td>
          </tr>
        `).join("")
        : '<tr><td colspan="7">No stock history.</td></tr>';

  } catch (e) {

    console.error("Movement error:", e);
  }
}

/* =========================
   REPORTS
========================= */

async function loadReports() {

  try {

    const [salesResponse, stockResponse] =
      await Promise.all([
        fetch("/api/reports/sales"),
        fetch("/api/reports/stock")
      ]);

    const sales = await salesResponse.json();
    const stock = await stockResponse.json();

    if ($("salesReport")) {

      $("salesReport").innerHTML =
        sales.length
          ? `
            <table>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Date</th>
              </tr>

              ${sales.map(x => `
                <tr>
                  <td>${esc(x.invoice)}</td>
                  <td>${esc(x.customer || "")}</td>
                  <td>${money(x.total)}</td>
                  <td>${esc(
                    String(x.created_at || "")
                      .replace("T", " ")
                  )}</td>
                </tr>
              `).join("")}

            </table>
          `
          : "No sales yet.";
    }

    if ($("stockReport")) {

      $("stockReport").innerHTML =
        stock.length
          ? `
            <table>
              <tr>
                <th>Medicine</th>
                <th>Stock</th>
                <th>Expiry</th>
              </tr>

              ${stock.map(x => {

                const expiry =
                  x.expiry
                    ? new Date(x.expiry)
                    : null;

                const expired =
                  expiry && expiry < new Date();

                const low =
                  Number(x.stock) <=
                  Number(x.min_stock);

                return `
                  <tr>
                    <td>${esc(x.name)}</td>

                    <td class="${low ? "stocklow" : ""}">
                      ${x.stock}
                    </td>

                    <td class="${expired ? "expired" : ""}">
                      ${x.expiry || "—"}
                    </td>
                  </tr>
                `;

              }).join("")}

            </table>
          `
          : "No alerts.";
    }

  } catch (e) {

    console.error("Reports error:", e);
  }
}

/* =========================
   USERS
========================= */

async function loadUsers() {

  if (!$("userRows"))
    return;

  if (currentUser?.role !== "admin")
    return;

  try {

    const r = await fetch("/api/users");

    if (!r.ok) {
      $("userRows").innerHTML =
        '<tr><td colspan="5">Access denied.</td></tr>';
      return;
    }

    const users = await r.json();

    $("userRows").innerHTML =
      users.length
        ? users.map(u => `
          <tr>
            <td>${esc(u.username)}</td>
            <td>${esc(u.role)}</td>
            <td>${u.active ? "Active" : "Disabled"}</td>
            <td>${esc(u.created_at || "")}</td>
            <td>
              ${
                u.username !== currentUser.username
                  ? `<button onclick="deleteUser(${u.id})">Delete</button>`
                  : "Current user"
              }
            </td>
          </tr>
        `).join("")
        : '<tr><td colspan="5">No users.</td></tr>';

  } catch (e) {

    console.error("Users error:", e);
  }
}

async function createUser() {

  if (currentUser?.role !== "admin")
    return;

  const username = $("newUsername")?.value.trim();
  const password = $("newPassword")?.value;
  const role = $("newRole")?.value || "staff";

  if (!username || !password) {
    alert("Enter username and password.");
    return;
  }

  try {

    const r = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password,
        role
      })
    });

    const j = await r.json();

    if (!r.ok) {
      alert(j.error || "Could not create user.");
      return;
    }

    $("newUsername").value = "";
    $("newPassword").value = "";

    loadUsers();

  } catch (e) {

    alert("Server error.");
  }
}

async function deleteUser(id) {

  if (!confirm("Delete this user?"))
    return;

  try {

    const r = await fetch(
      "/api/users/" + id,
      {
        method: "DELETE"
      }
    );

    const j = await r.json();

    if (!r.ok) {
      alert(j.error || "Could not delete user.");
      return;
    }

    loadUsers();

  } catch (e) {

    alert("Server error.");
  }
}

/* =========================
   START
========================= */

document.addEventListener("DOMContentLoaded", () => {

  updateClock();

  if ($("loginPassword")) {
    $("loginPassword").addEventListener("keydown", e => {
      if (e.key === "Enter")
        login();
    });
  }

  if ($("discount")) {
    $("discount").addEventListener("input", renderCart);
  }

  checkSession();
});

/* =========================
   THEME / APPEARANCE
========================= */

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);

  const lightBtn = $("lightThemeBtn");
  const darkBtn = $("darkThemeBtn");

  if (lightBtn) lightBtn.classList.toggle("active", !dark);
  if (darkBtn) darkBtn.classList.toggle("active", dark);
}

function setTheme(theme) {
  const selected = theme === "dark" ? "dark" : "light";
  localStorage.setItem("pharmastock-theme", selected);
  applyTheme(selected);
}

function initTheme() {
  const saved = localStorage.getItem("pharmastock-theme");
  const theme = saved === "dark" ? "dark" : "light";
  applyTheme(theme);
}

initTheme();

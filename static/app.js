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

  if ($("bdClock")) {
    $("bdClock").textContent = `${date} ${time}`;
  }

  if ($("currentTime")) {
    $("currentTime").textContent = `${date} ${time}`;
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
        alerts.push(`🔴 ${d.expired} batch(es) are expired.`);

      if (d.near_expiry > 0)
        alerts.push(`🟠 ${d.near_expiry} batch(es) are near expiry.`);

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

    const today = bdToday();

    let rows = meds.map(m => {
      const expiry = m.next_expiry
        ? String(m.next_expiry).slice(0, 10)
        : (m.expiry ? String(m.expiry).slice(0, 10) : "");

      const ex = expiry && expiry < today;
      const low = Number(m.stock) <= Number(m.min_stock);
      const expiredStock = Number(m.expired_stock || 0);
      const sellableStock = Number(m.sellable_stock ?? m.stock ?? 0);

      let expiryClass = "";
      let expiryLabel = expiry || "—";

      if (ex) {
        expiryClass = "expired";
        expiryLabel += " (EXPIRED)";
      } else if (expiry) {
        const days = Math.ceil(
          (new Date(expiry + "T00:00:00") -
           new Date(today + "T00:00:00")) / 86400000
        );
        if (days <= 90) {
          expiryClass = "near-expiry";
          expiryLabel += ` (${days}d)`;
        }
      }

      return `
        <tr>
          <td>
            <b>${esc(m.name)}</b>
            <br>
            <small>${esc(m.generic || "")}</small>
          </td>
          <td>${esc(m.company || "")}</td>
          <td>
            ${esc(m.batch || "Multiple")}
            <br><small>${Number(m.batch_stock || m.stock || 0)} batch units</small>
          </td>
          <td class="${expiryClass}">
            ${esc(expiryLabel)}
            ${expiredStock > 0
              ? `<br><small>${expiredStock} expired unit(s)</small>`
              : ""}
          </td>
          <td>${money(m.purchase)}</td>
          <td>${money(m.price)}</td>
          <td class="${low ? "stocklow" : ""}">
            ${m.stock}<br><small>${sellableStock} sellable</small>
          </td>
          <td>
            <button onclick="loadBatches(${m.id}, ${JSON.stringify(m.name)})">Batches</button>
            <button onclick='openMed(${JSON.stringify(m)})'>Edit</button>
            <button onclick="delMed(${m.id})">Delete</button>
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
    $("saleMed").innerHTML = opts;

  if ($("purMed"))
    $("purMed").innerHTML = opts;
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
    if ($(k)) $(k).value = m?.[k] || "";
  });

  if ($("purchase"))
    $("purchase").value = m?.purchase || "";

  if ($("price"))
    $("price").value = m?.price || "";

  if ($("medstock"))
    $("medstock").value = m?.stock ?? "";

  if ($("minstock"))
    $("minstock").value = m?.min_stock ?? 10;

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

  if ($("subtotal"))
    $("subtotal").textContent = money(subtotal);

  if ($("cartTotal"))
    $("cartTotal").textContent = money(subtotal);
}

async function completeSale() {

  if (!cart.length) {
    alert("Cart is empty.");
    return;
  }

  const discount =
    Number($("discount")?.value || 0);

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

    const r = await fetch(
      "/api/sales/" + encodeURIComponent(invoice)
    );

    if (!r.ok) {
      alert("Invoice information could not be loaded.");
      return;
    }

    const data = await r.json();

    const items = data.items || [];

    const rows = items.map(item => `
      <tr>
        <td>${esc(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${money(item.price)}</td>
        <td>${money(item.quantity * item.price)}</td>
      </tr>
    `).join("");

    const win = window.open("", "_blank");

    if (!win) {
      alert("Please allow pop-ups to print the invoice.");
      return;
    }

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>Invoice ${esc(invoice)}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
          }

          h1 {
            margin-bottom: 5px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
          }

          .right {
            text-align: right;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>

      <body>

        <h1>💊 PharmaStock</h1>
        <p>Pharmacy Invoice</p>

        <hr>

        <p>
          <b>Invoice:</b> ${esc(invoice)}<br>
          <b>Customer:</b> ${esc(data.customer || "Walk-in Customer")}<br>
          <b>Date:</b> ${esc(data.created_at || "")}
        </p>

        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>

        <h3 class="right">
          Subtotal: ${money(data.subtotal)}
        </h3>

        <h3 class="right">
          Discount: ${money(data.discount)}
        </h3>

        <h2 class="right">
          Total: ${money(data.total)}
        </h2>

        <p>
          Thank you for your purchase.
        </p>

        <button onclick="window.print()">
          Print
        </button>

      </body>
      </html>
    `);

    win.document.close();

  } catch (e) {

    console.error(e);
    alert("Could not open invoice.");
  }
}

/* =========================
   BATCH DETAILS
========================= */

async function loadBatches(mid, medicineName) {
  const modal = $("batchModal");
  const title = $("batchModalTitle");
  const rows = $("batchRows");

  if (!modal || !rows) return;

  title.textContent = `📦 ${medicineName} — Batches`;
  rows.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  modal.classList.remove("hidden");

  try {
    const r = await fetch(`/api/medicines/${mid}/batches`);

    if (!r.ok) {
      rows.innerHTML = '<tr><td colspan="6">Could not load batches.</td></tr>';
      return;
    }

    const data = await r.json();
    const today = bdToday();

    rows.innerHTML = data.map(b => {
      const expiry = b.expiry ? String(b.expiry).slice(0, 10) : "";
      let status = "OK";
      let cls = "";

      if (expiry && expiry < today) {
        status = "EXPIRED";
        cls = "expired";
      } else if (expiry) {
        const days = Math.ceil(
          (new Date(expiry + "T00:00:00") -
           new Date(today + "T00:00:00")) / 86400000
        );
        if (days <= 90) {
          status = `NEAR (${days}d)`;
          cls = "near-expiry";
        }
      }

      return `
        <tr>
          <td>${esc(b.batch || "—")}</td>
          <td class="${cls}">${esc(expiry || "—")}</td>
          <td>${Number(b.stock || 0)}</td>
          <td>${money(b.purchase_price)}</td>
          <td>${money(b.selling_price)}</td>
          <td class="${cls}">${status}</td>
        </tr>
      `;
    }).join("") || '<tr><td colspan="6">No batches found.</td></tr>';

  } catch (e) {
    console.error(e);
    rows.innerHTML = '<tr><td colspan="6">Server error.</td></tr>';
  }
}

function closeBatchModal() {
  if ($("batchModal")) $("batchModal").classList.add("hidden");
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

    const r = await fetch("/api/stock-movements");

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

  checkSession();
});

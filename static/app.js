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

/* =========================
   SIDEBAR / FULL SCREEN
========================= */

function applySidebarState(hidden) {
  const app = $("app");
  if (!app) return;

  app.classList.toggle("sidebar-collapsed", !!hidden);
  localStorage.setItem("pharmastock-sidebar-hidden", hidden ? "1" : "0");
}

function hideSidebar() {
  applySidebarState(true);
}

function showSidebar() {
  applySidebarState(false);
}

function initSidebar() {
  applySidebarState(localStorage.getItem("pharmastock-sidebar-hidden") === "1");
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

  if ($("headerUserName")) {
    $("headerUserName").textContent = currentUser?.username || "User";
  }
  if ($("headerUserRole")) {
    $("headerUserRole").textContent = currentUser?.role === "admin" ? "Administrator" : "Staff";
  }

  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display =
      currentUser?.role === "admin" ? "" : "none";
  });

  loadDash();
  loadMeds();
}

function toggleLoginPassword(){const input=$("loginPassword"),eye=$("loginPasswordEye"),button=document.querySelector(".password-toggle");if(!input)return;const visible=input.type==="text";input.type=visible?"password":"text";if(eye)eye.textContent=visible?"👁️":"🙈";if(button){button.setAttribute("aria-label",visible?"Show password":"Hide password");button.setAttribute("title",visible?"Show password":"Hide password");}}

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
    analytics: "Analytics",
    profitLoss: "Profit & Loss",
    suppliers: "Suppliers",
    customers: "Customers",
    settings: "Settings",
    deletedInvoices: "Deleted Invoices",
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
  if (id === "analytics") loadAnalytics();
  if (id === "profitLoss") loadProfitLoss();
  if (id === "suppliers") loadSuppliers();
  if (id === "customers") loadCustomers();
  if (id === "settings") loadPharmacyProfile();
  if (id === "deletedInvoices") loadDeletedInvoices();
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

  if ($("currentTime")) {
    $("currentTime").textContent = `Date : ${date} | Time : ${time}`;
  }
}

setInterval(updateClock, 1000);

/* =========================
   DASHBOARD
========================= */

let dashboardLowStock = [];

async function editLowStockMedicine(id) {
  const medicine = dashboardLowStock.find(m => Number(m.id) === Number(id));

  if (medicine) {
    openMed(medicine);
    return;
  }

  try {
    const r = await fetch("/api/medicines?q=");
    if (!r.ok) return;
    const allMeds = await r.json();
    const found = allMeds.find(m => Number(m.id) === Number(id));
    if (found) openMed(found);
  } catch (e) {
    console.error("Could not open medicine editor:", e);
  }
}

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
    if ($("todayProfit")) $("todayProfit").textContent = money(d.today_profit);
    if ($("monthSales")) $("monthSales").textContent = money(d.month_sales);
    if ($("monthProfit")) $("monthProfit").textContent = money(d.month_profit);
    if ($("totalInvoices")) $("totalInvoices").textContent = d.total_invoices || 0;

    if ($("nearExpiry")) {
      $("nearExpiry").textContent = d.near_expiry || 0;
    }

    loadAnalytics();
    loadDashboardNotifications();

    if ($("dashboardAlerts")) {
      try {
        const medsResponse = await fetch("/api/medicines?q=");

        if (medsResponse.status === 401) {
          showLogin();
          return;
        }

        const allMeds = await medsResponse.json();
        dashboardLowStock = allMeds.filter(m =>
          Number(m.stock) <= Number(m.min_stock)
        );

        let alerts = [];

        if (dashboardLowStock.length) {
          alerts.push(`
            <div class="stock-alert-list">
              ${dashboardLowStock.map(m => `
                <div class="stock-alert-item">
                  <div class="stock-alert-info">
                    <b>${esc(m.name)}</b>
                    <span>${Number(m.stock)===0 ? '🔴 Out of stock' : `Stock: ${esc(m.stock)} — Minimum: ${esc(m.min_stock)}`}</span>
                  </div>
                  <button type="button" onclick="editLowStockMedicine(${Number(m.id)})">
                    ✏️ Edit
                  </button>
                </div>
              `).join("")}
            </div>
          `);
        }

        if (d.expired > 0)
          alerts.push(`<div class="msg">🔴 ${d.expired} medicine(s) are expired.</div>`);

        if (d.near_expiry > 0)
          alerts.push(`<div class="msg">🟠 ${d.near_expiry} medicine(s) are near expiry.</div>`);

        $("dashboardAlerts").innerHTML =
          alerts.length
            ? alerts.join("")
            : '<div class="msg">✓ No stock alerts.</div>';

      } catch (e) {
        console.error("Stock alerts error:", e);
        $("dashboardAlerts").innerHTML =
          '<div class="msg error">Could not load stock alerts.</div>';
      }
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
  const s = String(value).trim();

  // Native date inputs and the API use ISO date-only values.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Accept DD/MM/YYYY without passing it through JavaScript Date parsing.
  const dmy = s.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // Legacy API values such as "Sun, 07 Jan 2029 00:00:00 GMT".
  // Read the calendar date directly so the browser timezone cannot shift it.
  const legacy = s.match(/^(?:\w{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (legacy) {
    const months = {Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"};
    const mm = months[legacy[2]];
    if (mm) return `${legacy[3]}-${mm}-${String(legacy[1]).padStart(2, "0")}`;
  }

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

          <td>${esc(m.company || m.manufacturer || "")}</td>

          <td>${esc(m.barcode || "")}</td>

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

            ${currentUser?.role === "admin" ? `<button onclick="delMed(${m.id})">Delete</button>` : ""}
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
    "manufacturer",
    "barcode",
    "batch",
    "expiry"
  ].forEach(k => {
    if ($(k)) {
      $(k).value = k === "expiry"
        ? normalizeDateInput(m?.[k])
        : (m?.[k] || "");
    }
  });

  if ($("medPurchase"))
    $("medPurchase").value = m?.purchase ?? "";

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
    manufacturer: $("manufacturer")?.value || "",
    barcode: $("barcode")?.value || "",
    batch: $("batch").value,
    expiry: $("expiry").value,
    purchase: $("medPurchase").value,
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
        mobile: $("customerMobile")?.value || "",
        discount,
        payment_method: $("paymentMethod")?.value || "Cash",
        payment_status: $("paymentStatus")?.value || "Paid",
        paid_amount: $("paidAmount")?.value || "",
        payment_details: $("paymentDetails")?.value || "",
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

    if ($("customerMobile"))
      $("customerMobile").value = "";

    if ($("discount")) $("discount").value = "";
    if ($("paymentMethod")) $("paymentMethod").value = "";
    if ($("paymentStatus")) $("paymentStatus").value = "";
    if ($("paidAmount")) $("paidAmount").value = "";
    if ($("paymentDetails")) $("paymentDetails").value = "";
    if ($("saleBarcode")) $("saleBarcode").value = "";

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

async function loadDashboardNotifications(){
  const box=$("dashboardNotifications"); if(!box)return;
  try{const r=await fetch('/api/stock-movements');if(!r.ok)return;const rows=await r.json();const recent=rows.filter(x=>String(x.movement_type||'').toUpperCase()==='STOCK_IN').slice(0,5);box.innerHTML=recent.length?recent.map(x=>`<div class="notification-row"><span>📦 <b>${esc(x.name||'Medicine')}</b> — ${x.quantity} units${x.batch?` · Batch ${esc(x.batch)}`:''}</span><small>${esc(String(x.created_at||'').replace('T',' '))}</small></div>`).join(''):'No recent stock-in notifications.';}catch(e){box.innerHTML='Unable to load notifications.';}
}

/* =========================
   BARCODE SCANNER
========================= */
function barcodeKeydown(e){
  if(e.key!=="Enter") return; e.preventDefault();
  const code=String($("saleBarcode")?.value||"").trim(); if(!code)return;
  const m=meds.find(x=>String(x.barcode||"").trim()===code);
  if(!m){alert("Medicine barcode not found.");return;}
  $("saleMed").value=String(m.id); $("saleQty").value="1"; addCart(); $("saleBarcode").value=""; $("saleBarcode").focus();
}
async function startBarcodeScanner(){
  const input=$("saleBarcode"); if(!input)return;
  if(!window.BarcodeDetector||!navigator.mediaDevices?.getUserMedia){alert("Camera barcode scanning is not supported here. You can use a USB barcode scanner or enter the barcode manually.");input.focus();return;}
  try{
    const detector=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e","code_128","code_39"]});
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}});
    const wrap=document.createElement("div"); wrap.className="scanner-overlay";
    wrap.innerHTML='<div class="scanner-box"><h3>📷 Scan Barcode</h3><video autoplay playsinline></video><button type="button">Close</button></div>';
    document.body.appendChild(wrap); const video=wrap.querySelector("video"); video.srcObject=stream;
    const close=()=>{stream.getTracks().forEach(t=>t.stop());wrap.remove();}; wrap.querySelector("button").onclick=close;
    const scan=async()=>{if(!document.body.contains(wrap))return;try{const codes=await detector.detect(video);if(codes.length){input.value=codes[0].rawValue;close();barcodeKeydown({key:"Enter",preventDefault(){}});return;}}catch(e){}requestAnimationFrame(scan);}; requestAnimationFrame(scan);
  }catch(e){alert("Camera access was not available. Please allow camera access or use a barcode scanner.");input.focus();}
}

/* =========================
   ANALYTICS / PROFIT & LOSS
========================= */
async function loadAnalytics(){
  const r=await fetch('/api/analytics'); if(!r.ok)return; const d=await r.json();
  if($('todayProfit'))$('todayProfit').textContent=money(d.today_profit);
  if($('monthSales'))$('monthSales').textContent=money(d.month_sales);
  if($('monthProfit'))$('monthProfit').textContent=money(d.month_profit);

  const charts=[$('salesChart'),$('salesChartAnalytics')].filter(Boolean);
  const bests=[$('bestSellers'),$('bestSellersAnalytics')].filter(Boolean);
  const daily=(d.daily||[]).slice(-7);
  const vals=daily.map(x=>Number(x.sales||0));
  const profits=daily.map(x=>Number(x.profit||0));
  const max=Math.max(1,...vals,...profits);
  const w=620,h=190,padL=38,padR=10,padT=14,padB=28;
  const sx=i=>daily.length<=1?(w-padL-padR)/2+padL:(padL+i*(w-padL-padR)/(daily.length-1));
  const sy=v=>padT+(h-padT-padB)*(1-v/max);
  const salesPts=vals.map((v,i)=>`${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const profitPts=profits.map((v,i)=>`${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  const dark=document.body.classList.contains('dark');
  const gridColor=dark?'#21483e':'#e7eef1';
  const axisColor=dark?'#8faea3':'#8da0aa';
  const labelColor=dark?'#8faea3':'#8095a1';
  const salesColor='#10a56f';
  const profitColor='#2587e0';
  const grid=[0,.25,.5,.75,1].map(fr=>{
    const y=padT+(h-padT-padB)*fr;
    const label=money(max*(1-fr)).replace('৳','');
    return `<line x1="${padL}" y1="${y}" x2="${w-padR}" y2="${y}" stroke="${gridColor}" stroke-width="1"/><text x="3" y="${y+3}" font-size="8" fill="${axisColor}">${esc(label)}</text>`;
  }).join('');
  const labels=daily.map((x,i)=>`<text x="${sx(i)}" y="${h-8}" text-anchor="middle" font-size="8" fill="${labelColor}">${esc(String(x.day||'').slice(5).replace('-','/'))}</text>`).join('');
  const dots=vals.map((v,i)=>`<circle cx="${sx(i)}" cy="${sy(v)}" r="3" fill="${salesColor}"/>`).join('')+profits.map((v,i)=>`<circle cx="${sx(i)}" cy="${sy(v)}" r="3" fill="${profitColor}"/>`).join('');
  const chartSvg=`<svg viewBox="0 0 ${w} ${h}" width="100%" height="190" role="img" aria-label="Sales and profit chart">${grid}<polyline points="${salesPts}" fill="none" stroke="${salesColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${profitPts}" fill="none" stroke="${profitColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  charts.forEach(el=>el.innerHTML=chartSvg);

  const bestHtml=(d.best_sellers||[]).map((x,i)=>`<div class="rank-row"><b>${i+1}</b><span>${esc(x.name)}</span><strong>${x.qty}</strong><em>↑ ${Math.max(1,Math.round(Number(x.profit||0)))}%</em></div>`).join('')||'<p class="muted">No sales yet.</p>';
  bests.forEach(best=>best.innerHTML=bestHtml);
}
async function loadProfitLoss(){
  const r=await fetch('/api/profit-loss?start='+encodeURIComponent($("plStart")?.value||"")+'&end='+encodeURIComponent($("plEnd")?.value||""));if(!r.ok)return;const d=await r.json();
  $("plSummary").innerHTML=`<div class="card"><span>Sales</span><b>${money(d.summary.sales)}</b></div><div class="card"><span>Cost</span><b>${money(d.summary.cost)}</b></div><div class="card profit-card"><span>Gross Profit</span><b>${money(d.summary.profit)}</b></div>`;
  $("plReport").innerHTML=d.rows.length?`<div class="tablewrap"><table><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Sales</th><th>Cost</th><th>Profit</th></tr>${d.rows.map(x=>`<tr><td>${esc(x.invoice)}</td><td>${esc(String(x.created_at||"").replace("T"," "))}</td><td>${esc(x.customer)}</td><td>${money(x.total)}</td><td>${money(x.cost)}</td><td>${money(x.gross_profit)}</td></tr>`).join("")}</table></div>`:'<p class="muted">No sales in this period.</p>';
}

/* =========================
   SUPPLIERS / CUSTOMERS
========================= */
async function loadSuppliers(){const r=await fetch('/api/suppliers');if(!r.ok)return;const rows=await r.json();$("supplierList").innerHTML=rows.length?`<div class="tablewrap"><table><tr><th>Supplier</th><th>Phone</th><th>Purchases</th><th>Owed</th><th>Action</th></tr>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.phone)}</td><td>${money(x.total_purchases||0)}</td><td>${money(x.outstanding||0)}</td><td><button onclick="viewSupplier(${x.id})">History</button>${currentUser?.role==='admin'?` <button class="danger" onclick="deleteSupplier(${x.id})">Delete</button>`:""}</td></tr>`).join("")}</table></div>`:'No suppliers yet.';}
async function saveSupplier(){const d={name:$("supplierName").value,phone:$("supplierPhone").value,address:$("supplierAddress").value};const r=await fetch('/api/suppliers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok){$("supplierMsg").innerHTML=`<div class="msg error">${esc(j.error)}</div>`;return;}$("supplierName").value=$("supplierPhone").value=$("supplierAddress").value="";$("supplierMsg").innerHTML='<div class="msg">Supplier saved.</div>';loadSuppliers();}
async function deleteSupplier(id){if(!confirm('Delete this supplier?'))return;await fetch('/api/suppliers/'+id,{method:'DELETE'});loadSuppliers();}
async function viewSupplier(id){const r=await fetch('/api/suppliers/'+id+'/purchases');const d=await r.json();alert((d.purchases||[]).map(x=>`${x.created_at} — ${x.name} — ${x.quantity} units — ${money(Number(x.purchase_price||0)*Number(x.quantity||0))}`).join("\n")||'No purchase history.');}
async function loadCustomers(){const r=await fetch('/api/customers');if(!r.ok)return;const rows=await r.json();$("customerList").innerHTML=rows.length?`<div class="tablewrap"><table><tr><th>Customer</th><th>Mobile</th><th>Purchases</th><th>Outstanding</th><th>Action</th></tr>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.mobile)}</td><td>${money(x.total_purchases||0)}</td><td>${money(x.outstanding||0)}</td><td><button onclick="viewCustomer(${x.id})">History</button></td></tr>`).join("")}</table></div>`:'No customers yet.';}
async function saveCustomer(){const d={name:$("customerName").value,mobile:$("customerPhone").value,address:$("customerAddress").value};const r=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(!r.ok){$("customerMsg").innerHTML=`<div class="msg error">${esc(j.error)}</div>`;return;}$("customerName").value=$("customerPhone").value=$("customerAddress").value="";$("customerMsg").innerHTML='<div class="msg">Customer saved.</div>';loadCustomers();}
async function viewCustomer(id){const r=await fetch('/api/customers/'+id+'/history');const d=await r.json();alert((d.sales||[]).map(x=>`${x.invoice} — ${x.created_at} — ${money(x.total)} — ${x.payment_status}`).join("\n")||'No purchase history.');}

function loadPharmacyProfile(){const p=JSON.parse(localStorage.getItem('pharmastock-profile')||'{}');['pharmacyName','pharmacyPhone','pharmacyAddress'].forEach(k=>{if($(k))$(k).value=p[k]||'';});}
function savePharmacyProfile(){const file=$("pharmacyLogo")?.files?.[0];const old=JSON.parse(localStorage.getItem('pharmastock-profile')||'{}');const p={pharmacyName:$("pharmacyName").value,pharmacyPhone:$("pharmacyPhone").value,pharmacyAddress:$("pharmacyAddress").value,logo:old.logo||''};const done=()=>{localStorage.setItem('pharmastock-profile',JSON.stringify(p));$("profileMsg").innerHTML='<div class="msg">Pharmacy profile saved.</div>';};if(file){const rd=new FileReader();rd.onload=()=>{p.logo=rd.result;done();};rd.readAsDataURL(file);}else done();}

async function loadAuditLogs(){
  if(!$("auditList")||currentUser?.role!=="admin")return;
  const r=await fetch("/api/audit-logs");
  if(!r.ok)return;
  const rows=await r.json();
  $("auditList").innerHTML=rows.length?`<div class="tablewrap audit-table-wrap"><table class="audit-table"><thead><tr><th class="audit-check"><input type="checkbox" id="auditSelectAll" onchange="toggleAllAuditLogs(this.checked)" aria-label="Select all"></th><th>User</th><th>Action</th><th>Details</th><th>Login Date</th><th>Login Time</th><th>Logout Date</th><th>Logout Time</th></tr></thead><tbody>${rows.map(x=>{
    const raw=String(x.created_at||"").replace("T"," ");
    const parts=raw.split(" ");
    const date=parts[0]||"";
    const time=(parts[1]||"").slice(0,8);
    const login=x.action==="LOGIN";
    const logout=x.action==="LOGOUT";
    return `<tr><td class="audit-check"><input type="checkbox" class="audit-select" value="${Number(x.id)}" aria-label="Select activity ${Number(x.id)}"></td><td>${esc(x.username)}</td><td>${esc(x.action)}</td><td>${esc(x.details)}</td><td>${login?esc(date):"—"}</td><td>${login?esc(time):"—"}</td><td>${logout?esc(date):"—"}</td><td>${logout?esc(time):"—"}</td></tr>`;
  }).join("")}</tbody></table></div>`:"No activity yet.";
}

function toggleAllAuditLogs(checked){
  document.querySelectorAll(".audit-select").forEach(cb=>cb.checked=checked);
}

async function deleteSelectedAuditLogs(){
  const ids=[...document.querySelectorAll(".audit-select:checked")].map(cb=>Number(cb.value)).filter(Boolean);
  if(!ids.length){alert("Please select at least one activity record.");return;}
  if(!confirm(`Delete ${ids.length} selected activity record(s)?`))return;
  const r=await fetch("/api/audit-logs/delete-selected",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){alert(d.error||"Could not delete selected activity records.");return;}
  await loadAuditLogs();
}

async function deleteAllAuditLogs(){
  if(!confirm("Delete ALL staff activity history? This cannot be undone."))return;
  const r=await fetch("/api/audit-logs/delete-all",{method:"DELETE"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){alert(d.error||"Could not delete activity history.");return;}
  await loadAuditLogs();
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
    const profile = JSON.parse(localStorage.getItem("pharmastock-profile") || "{}");
    const profileName = profile.pharmacyName || "PharmaStock";
    const profilePhone = profile.pharmacyPhone || "";
    const profileAddress = profile.pharmacyAddress || "";
    const profileLogo = profile.logo || "";

    const calculatedSubtotal = items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.price || 0));
    }, 0);

    const invoiceSubtotal = Number(sale.subtotal || 0) || calculatedSubtotal;
    const invoiceDiscount = Number(sale.discount || 0);
    const invoiceDiscountPercent = invoiceSubtotal > 0 ? (invoiceDiscount / invoiceSubtotal) * 100 : 0;
    const invoiceTotal = Number(sale.total || 0) || Math.max(0, invoiceSubtotal - invoiceDiscount);

    const rows = items.map(item => {
      const lineTotal = Number(item.quantity || 0) * Number(item.price || 0);
      const expiry = formatDateBD(item.expiry);
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
            <div><div class="brand">${profileLogo ? `<img src="${profileLogo}" style="width:38px;height:38px;object-fit:contain;vertical-align:middle;margin-right:7px">` : '<span>💊</span>'} ${esc(profileName)}</div><div class="tag">${esc(profileAddress)}${profilePhone ? ` · ${esc(profilePhone)}` : ''}</div></div>
            <div class="invoice-title"><h1>SALES INVOICE</h1><p>Original Customer Copy</p></div>
          </div>

          <div class="meta">
            <div><b>Invoice Number</b><span>${esc(invoice)}</span></div>
            <div><b>Date</b><span>${esc(invoiceDate || "—")}</span></div>
            <div><b>Time</b><span>${esc(invoiceTime || "—")}</span></div>
            <div><b>Customer</b><span>${esc(sale.customer || "Walk-in Customer")}</span></div>
            <div><b>Mobile</b><span>${esc(sale.mobile || "—")}</span></div>
            <div><b>Payment</b><span>${esc(sale.payment_method || "Cash")} — ${esc(sale.payment_status || "Paid")}</span></div>
            <div><b>Paid Amount</b><span>${money(sale.paid_amount || invoiceTotal)}</span></div>
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
          <div class="print"><button onclick="window.print()">🖨️ Print / Save PDF</button></div>
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

let salesReportData = [];

function renderSalesReport() {
  if (!$("salesReport")) return;

  const query = String($("invoiceSearch")?.value || "").trim().toLowerCase();
  const filtered = salesReportData.filter(x => {
    const invoice = String(x.invoice || "").toLowerCase();
    const customer = String(x.customer || "").toLowerCase();
    const mobile = String(x.mobile || "").toLowerCase();
    return !query || invoice.includes(query) || customer.includes(query) || mobile.includes(query);
  });

  $("salesReport").innerHTML = filtered.length
    ? `
      <table>
        <tr>
          <th>Invoice</th>
          <th>Customer</th>
          <th>Mobile</th>
          <th>Total</th>
          <th>Date</th>
          <th>Actions</th>
        </tr>
        ${filtered.map(x => `
          <tr>
            <td>${esc(x.invoice)}</td>
            <td>${esc(x.customer || "")}</td>
            <td>${esc(x.mobile || "")}</td>
            <td>${money(x.total)}</td>
            <td>${esc(String(x.created_at || "").replace("T", " ") )}</td>
            <td class="report-actions">
              <button class="btn-small" onclick="printInvoice('${esc(x.invoice)}')">🖨️ Print</button>
              <button class="btn-small danger" onclick="deleteInvoice('${esc(x.invoice)}')">🗑️ Delete</button>
            </td>
          </tr>
        `).join("")}
      </table>
    `
    : "No matching invoices.";
}

function filterSalesReport() {
  renderSalesReport();
}

async function deleteInvoice(invoice) {
  if (!confirm(`Move invoice ${invoice} to Deleted Invoices? Its stock will be restored and the backup will be kept for 60 days.`)) return;

  try {
    const r = await fetch("/api/sales/" + encodeURIComponent(invoice), { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) {
      alert(j.error || "Invoice could not be deleted.");
      return;
    }

    salesReportData = salesReportData.filter(x => x.invoice !== invoice);
    renderSalesReport();
    loadMeds();
    loadDash();
    alert("Invoice moved to Deleted Invoices. It will be kept for 60 days unless restored.");
  } catch (e) {
    alert("Invoice could not be deleted.");
  }
}

let deletedInvoiceData = [];

function renderDeletedInvoices() {
  if (!$('deletedInvoicesReport')) return;

  const query = String($('deletedInvoiceSearch')?.value || '').trim().toLowerCase();
  const filtered = deletedInvoiceData.filter(x => {
    return !query ||
      String(x.invoice || '').toLowerCase().includes(query) ||
      String(x.customer || '').toLowerCase().includes(query) ||
      String(x.mobile || '').toLowerCase().includes(query);
  });

  const today = new Date();
  const html = filtered.length ? `
    <table>
      <tr>
        <th>Invoice</th>
        <th>Customer</th>
        <th>Mobile</th>
        <th>Total</th>
        <th>Deleted On</th>
        <th>Expires</th>
        <th>Actions</th>
      </tr>
      ${filtered.map(x => {
        const deleted = new Date(String(x.deleted_at || '').replace(' ', 'T'));
        const expiry = new Date(deleted.getTime() + 60 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.max(0, Math.ceil((expiry - today) / (24 * 60 * 60 * 1000)));
        return `
          <tr>
            <td>${esc(x.invoice || '')}</td>
            <td>${esc(x.customer || '')}</td>
            <td>${esc(x.mobile || '')}</td>
            <td>${money(x.total)}</td>
            <td>${esc(String(x.deleted_at || '').replace('T', ' '))}</td>
            <td>${daysLeft} day${daysLeft === 1 ? '' : 's'}</td>
            <td class="report-actions">
              <button class="btn-small" onclick="printDeletedInvoice('${esc(x.invoice)}')">🖨️ Backup / Print</button>
              <button class="btn-small" onclick="restoreDeletedInvoice('${esc(x.invoice)}')">↩️ Restore</button>
              ${currentUser?.role === "admin" ? `<button class="btn-small danger" onclick="permanentlyDeleteInvoice('${esc(x.invoice)}')">🗑️ Delete Permanently</button>` : ""}
            </td>
          </tr>`;
      }).join('')}
    </table>` : 'No deleted invoices.';

  $('deletedInvoicesReport').innerHTML = html;
}

function filterDeletedInvoices() {
  renderDeletedInvoices();
}

async function loadDeletedInvoices() {
  try {
    const r = await fetch('/api/deleted-invoices');
    if (!r.ok) {
      $('deletedInvoicesReport').innerHTML = '<div class="msg error">Could not load deleted invoices.</div>';
      return;
    }
    deletedInvoiceData = await r.json();
    renderDeletedInvoices();
  } catch (e) {
    $('deletedInvoicesReport').innerHTML = '<div class="msg error">Could not load deleted invoices.</div>';
  }
}

async function restoreDeletedInvoice(invoice) {
  if (!confirm(`Restore invoice ${invoice}? The stock will be deducted again.`)) return;
  try {
    const r = await fetch('/api/deleted-invoices/' + encodeURIComponent(invoice) + '/restore', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) {
      alert(j.error || 'Invoice could not be restored.');
      return;
    }
    await loadDeletedInvoices();
    await loadReports();
    loadMeds();
    loadDash();
    alert('Invoice restored successfully.');
  } catch (e) {
    alert('Invoice could not be restored.');
  }
}

async function permanentlyDeleteInvoice(invoice) {
  if (!confirm(`Permanently delete invoice ${invoice}? This backup cannot be restored afterward.`)) return;
  try {
    const r = await fetch('/api/deleted-invoices/' + encodeURIComponent(invoice), { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) {
      alert(j.error || 'Invoice could not be permanently deleted.');
      return;
    }
    await loadDeletedInvoices();
    alert('Invoice permanently deleted.');
  } catch (e) {
    alert('Invoice could not be permanently deleted.');
  }
}

async function printDeletedInvoice(invoice) {
  try {
    const r = await fetch('/api/deleted-invoices/' + encodeURIComponent(invoice));
    if (!r.ok) {
      alert('Deleted invoice backup could not be loaded.');
      return;
    }
    const sale = await r.json();
    const items = sale.items || [];
    const rows = items.map(item => `
      <tr>
        <td><strong>${esc(item.name || '')}</strong>${item.generic ? `<div class="sub">${esc(item.generic)}</div>` : ''}</td>
        <td>${esc(item.batch || '—')}</td>
        <td>${formatDateBD(item.expiry)}</td>
        <td class="num">${item.quantity || 0}</td>
        <td class="num">${money(item.price)}</td>
        <td class="num"><strong>${money(Number(item.quantity || 0) * Number(item.price || 0))}</strong></td>
      </tr>`).join('');

    const win = window.open('', '_blank', 'width=900,height=800');
    if (!win) {
      alert('Please allow pop-ups to print the invoice backup.');
      return;
    }
    const subtotal = Number(sale.subtotal || 0);
    const discount = Number(sale.discount || 0);
    const total = Number(sale.total || 0);
    win.document.write(`<!doctype html><html><head><title>${esc(sale.invoice || 'Deleted Invoice')}</title><style>
      body{font-family:Arial,sans-serif;margin:32px;color:#222}h1{margin:0 0 6px}.meta{margin:4px 0}.sub{font-size:12px;color:#666;margin-top:3px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ddd;padding:9px;text-align:left}th{background:#f5f5f5}.num{text-align:right}.totals{margin:22px 0 0 auto;max-width:320px}.line{display:flex;justify-content:space-between;padding:5px 0}.grand{font-size:18px;font-weight:bold;border-top:2px solid #222;margin-top:6px;padding-top:8px}.deleted{margin-top:18px;font-weight:bold}
    </style></head><body><h1>DELETED SALES INVOICE BACKUP</h1><div class="meta"><b>Invoice:</b> ${esc(sale.invoice || '')}</div><div class="meta"><b>Customer:</b> ${esc(sale.customer || 'Walk-in')}</div><div class="meta"><b>Mobile:</b> ${esc(sale.mobile || '—')}</div><div class="meta"><b>Original Date:</b> ${esc(String(sale.created_at || '').replace('T',' '))}</div><div class="meta"><b>Deleted On:</b> ${esc(String(sale.deleted_at || '').replace('T',' '))}</div><div class="deleted">This is a deleted-invoice backup. It can be restored within 60 days.</div><table><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>${rows}</table><div class="totals"><div class="line"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="line"><span>Discount</span><span>${money(discount)}</span></div><div class="line grand"><span>Grand Total</span><span>${money(total)}</span></div></div><script>window.onload=()=>window.print();</script></body></html>`);
    win.document.close();
  } catch (e) {
    alert('Deleted invoice backup could not be printed.');
  }
}

async function loadReports() {

  try {

    const [salesResponse, stockResponse] =
      await Promise.all([
        fetch("/api/reports/sales"),
        fetch("/api/reports/stock")
      ]);

    salesReportData = await salesResponse.json();
    const stock = await stockResponse.json();

    renderSalesReport();

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

                const expiryIso = normalizeDateInput(x.expiry);

                const expired =
                  expiryIso && expiryIso < new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Dhaka",
                    year: "numeric", month: "2-digit", day: "2-digit"
                  }).format(new Date());

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
                      ${formatDateBD(x.expiry)}
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

  if (!$("userList"))
    return;

  if (currentUser?.role !== "admin")
    return;

  try {

    const r = await fetch("/api/users");

    if (!r.ok) {
      $("userList").innerHTML =
        '<div class="msg error">Access denied.</div>';
      return;
    }

    const users = await r.json();

    $("userList").innerHTML = users.length ? `<div class="tablewrap"><table><tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Action</th></tr>${users.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.role)}</td><td>${u.active ? "Active" : "Disabled"}</td><td>${esc(u.created_at || "")}</td><td>${u.username !== currentUser.username ? `<button onclick="editUser(${u.id},'${esc(u.username).replace(/'/g, "\\'")}','${esc(u.role)}')">✏️ Edit</button> <button onclick="toggleUser(${u.id},${u.active ? 'false':'true'})">${u.active ? 'Disable' : 'Enable'}</button> <button class="danger" onclick="deleteUser(${u.id})">Delete</button>` : 'Current user'}</td></tr>`).join('')}</table></div>` : 'No users.';

  } catch (e) {

    console.error("Users error:", e);
  }
  loadAuditLogs();
}

function toggleAdminPassword(id, button) {
  const input = $(id);
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  const eye = button?.querySelector("span");
  if (eye) eye.textContent = visible ? "👁️" : "🙈";
  if (button) {
    button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    button.setAttribute("title", visible ? "Show password" : "Hide password");
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

async function editUser(id, username, role) {
  if (currentUser?.role !== "admin") return;
  const newUsername = prompt("User ID:", username);
  if (newUsername === null) return;
  const newRole = prompt("Role (staff/admin):", role);
  if (newRole === null) return;
  const newPassword = prompt("New password (leave blank to keep current password):", "");
  if (newPassword === null) return;
  const payload = { username: newUsername.trim(), role: newRole.trim().toLowerCase() };
  if (newPassword) payload.password = newPassword;
  try {
    const r = await fetch("/api/users/" + id, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || "Could not update user."); return; }
    loadUsers();
  } catch (e) { alert("Server error."); }
}

async function toggleUser(id, active){if(!confirm(active?'Enable this user?':'Disable this user?'))return;const r=await fetch('/api/users/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active})});const j=await r.json();if(!r.ok){alert(j.error||'Could not update user.');return;}loadUsers();}

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

  if($("plStart")){const d=new Date();d.setDate(1);$("plStart").value=d.toISOString().slice(0,10);}
  if($("plEnd"))$("plEnd").value=new Date().toISOString().slice(0,10);
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
initSidebar();

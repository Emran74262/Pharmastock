
let meds=[],cart=[];
const $=id=>document.getElementById(id);
function money(n){return "৳"+Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2})}
function show(id,btn){
 document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
 $(id).classList.remove("hidden");
 document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
 if(btn)btn.classList.add("active");
 $("title").textContent={dashboard:"Dashboard",inventory:"Medicines",sales:"Sales & Billing",purchase:"Purchases",reports:"Reports"}[id];
 if(id==="dashboard")loadDash(); if(id==="inventory")loadMeds(); if(id==="sales"){loadMeds();renderCart()}
 if(id==="purchase")loadMeds(); if(id==="reports")loadReports();
}
async function loadDash(){let d=await (await fetch("/api/dashboard")).json();$("products").textContent=d.total_products;$("stock").textContent=d.stock;$("value").textContent=money(d.value);$("low").textContent=d.low;$("expired").textContent=d.expired;$("today").textContent=money(d.today)}
async function loadMeds(){
 meds=await (await fetch("/api/medicines?q="+encodeURIComponent($("search")?.value||""))).json();
 let rows=meds.map(m=>{let ex=m.expiry&&new Date(m.expiry)<new Date(), low=m.stock<=m.min_stock;
 return `<tr><td><b>${esc(m.name)}</b><br><small>${esc(m.generic||"")}</small></td><td>${esc(m.company||"")}</td><td>${esc(m.batch||"")}</td><td class="${ex?'expired':''}">${m.expiry||"—"}</td><td>${money(m.purchase)}</td><td>${money(m.price)}</td><td class="${low?'stocklow':''}">${m.stock}</td><td><button onclick='openMed(${JSON.stringify(m)})'>Edit</button> <button onclick='delMed(${m.id})'>Delete</button></td></tr>`}).join("");
 if($("medrows"))$("medrows").innerHTML=rows||'<tr><td colspan="8">No medicines found.</td></tr>';
 fillSelects();
}
function fillSelects(){
 let opts=meds.map(m=>`<option value="${m.id}">${esc(m.name)} — ${m.stock} in stock</option>`).join("");
 if($("saleMed"))$("saleMed").innerHTML=opts;
 if($("purMed"))$("purMed").innerHTML=opts;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]))}
function openMed(m=null){
 $("modal").classList.remove("hidden");$("mid").value=m?.id||"";
 ["name","generic","company","category","batch","expiry"].forEach(k=>$(k).value=m?.[k]||"");
 $("purchase").value=m?.purchase||"";$("price").value=m?.price||"";$("medstock").value=m?.stock??"";$("minstock").value=m?.min_stock??10;
 $("modalTitle").textContent=m?"Edit Medicine":"Add Medicine";
}
function closeMed(){$("modal").classList.add("hidden")}
async function saveMed(){
 let d={name:$("name").value,generic:$("generic").value,company:$("company").value,category:$("category").value,batch:$("batch").value,expiry:$("expiry").value,purchase:$("purchase").value,price:$("price").value,stock:$("medstock").value,min_stock:$("minstock").value};
 let id=$("mid").value, r=await fetch(id?"/api/medicines/"+id:"/api/medicines",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}),j=await r.json();
 if(!r.ok){$("medMsg").innerHTML=`<div class="msg error">${esc(j.error)}</div>`;return}
 closeMed();loadMeds();loadDash();
}
async function delMed(id){if(!confirm("Delete this medicine?"))return;await fetch("/api/medicines/"+id,{method:"DELETE"});loadMeds();loadDash()}
function addCart(){
 let id=+$("saleMed").value,qty=+$("saleQty").value,m=meds.find(x=>x.id===id);if(!m||qty<1)return;
 let old=cart.find(x=>x.id===id);if(old)old.qty+=qty;else cart.push({id,qty,name:m.name,price:m.price});
 renderCart();
}
function renderCart(){
 $("cart").innerHTML=cart.map((x,i)=>`<div class="cartitem"><span>${esc(x.name)} × ${x.qty}</span><span>${money(x.price*x.qty)} <button onclick="cart.splice(${i},1);renderCart()">×</button></span></div>`).join("")||'<p class="muted">Cart is empty.</p>';
 $("cartTotal").textContent=money(cart.reduce((s,x)=>s+x.price*x.qty,0));
}
async function completeSale(){
 if(!cart.length)return alert("Cart is empty.");
 let r=await fetch("/api/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customer:$("customer").value,items:cart.map(x=>({id:x.id,qty:x.qty}))})}),j=await r.json();
 if(!r.ok){$("saleMsg").innerHTML=`<div class="msg error">${esc(j.error)}</div>`;return}
 $("saleMsg").innerHTML=`<div class="msg">Sale completed. Invoice: <b>${j.invoice}</b> — ${money(j.total)}</div>`;
 cart=[];$("customer").value="";renderCart();loadMeds();loadDash();
}
async function addPurchase(){
 let d={medicine_id:$("purMed").value,supplier:$("supplier").value,batch:$("purBatch").value,expiry:$("purExpiry").value,quantity:$("purQty").value,purchase_price:$("purPrice").value};
 let r=await fetch("/api/purchases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}),j=await r.json();
 $("purMsg").innerHTML=`<div class="msg ${r.ok?'':'error'}">${r.ok?"Stock added successfully.":esc(j.error)}</div>`;
 if(r.ok){$("purQty").value="";loadMeds();loadDash()}
}
async function loadReports(){
 let s=await (await fetch("/api/reports/sales")).json(),st=await (await fetch("/api/reports/stock")).json();
 $("salesReport").innerHTML=s.length?`<table><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Date</th></tr>${s.map(x=>`<tr><td>${x.invoice}</td><td>${esc(x.customer)}</td><td>${money(x.total)}</td><td>${x.created_at.replace("T"," ")}</td></tr>`).join("")}</table>`:"No sales yet.";
 $("stockReport").innerHTML=st.length?`<table><tr><th>Medicine</th><th>Stock</th><th>Expiry</th></tr>${st.map(x=>`<tr><td>${esc(x.name)}</td><td class="${x.stock<=x.min_stock?'stocklow':''}">${x.stock}</td><td class="${x.expiry&&new Date(x.expiry)<new Date()?'expired':''}">${x.expiry||"—"}</td></tr>`).join("")}</table>`:"No alerts.";
}
loadDash();loadMeds();

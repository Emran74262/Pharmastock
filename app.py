
import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import io, csv

app = Flask(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://pharma:pharma@localhost:5432/pharmacy"
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS medicines(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  generic TEXT DEFAULT '',
  company TEXT DEFAULT '',
  category TEXT DEFAULT '',
  batch TEXT DEFAULT '',
  expiry DATE,
  purchase NUMERIC(12,2) DEFAULT 0,
  price NUMERIC(12,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 10
);
CREATE TABLE IF NOT EXISTS sales(
  id SERIAL PRIMARY KEY,
  invoice TEXT UNIQUE NOT NULL,
  customer TEXT DEFAULT 'Walk-in',
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS sale_items(
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id INTEGER REFERENCES medicines(id),
  quantity INTEGER NOT NULL,
  price NUMERIC(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases(
  id SERIAL PRIMARY KEY,
  medicine_id INTEGER REFERENCES medicines(id),
  supplier TEXT DEFAULT '',
  batch TEXT DEFAULT '',
  expiry DATE,
  quantity INTEGER NOT NULL,
  purchase_price NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP NOT NULL
);
"""

def init_db():
    with engine.begin() as conn:
        for statement in SCHEMA.strip().split(";"):
            if statement.strip():
                conn.execute(text(statement))

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return jsonify(status="ok", database="connected")
    except Exception:
        return jsonify(status="error", database="unavailable"), 503

@app.get("/api/dashboard")
def dashboard():
    with engine.connect() as c:
        total_products=c.execute(text("SELECT COUNT(*) FROM medicines")).scalar()
        stock=c.execute(text("SELECT COALESCE(SUM(stock),0) FROM medicines")).scalar()
        value=c.execute(text("SELECT COALESCE(SUM(stock*purchase),0) FROM medicines")).scalar()
        low=c.execute(text("SELECT COUNT(*) FROM medicines WHERE stock<=min_stock")).scalar()
        expired=c.execute(text("SELECT COUNT(*) FROM medicines WHERE expiry IS NOT NULL AND expiry<CURRENT_DATE")).scalar()
        today=c.execute(text("SELECT COALESCE(SUM(total),0) FROM sales WHERE created_at::date=CURRENT_DATE")).scalar()
    return jsonify(total_products=int(total_products), stock=int(stock), value=float(value),
                   low=int(low), expired=int(expired), today=float(today))

@app.get("/api/medicines")
def medicines():
    q=request.args.get("q","").strip()
    with engine.connect() as c:
        if q:
            rows=c.execute(text("""
              SELECT * FROM medicines
              WHERE name ILIKE :q OR generic ILIKE :q OR company ILIKE :q OR batch ILIKE :q
              ORDER BY name
            """), {"q":f"%{q}%"}).mappings().all()
        else:
            rows=c.execute(text("SELECT * FROM medicines ORDER BY name")).mappings().all()
    return jsonify([dict(r) for r in rows])

@app.post("/api/medicines")
def add_medicine():
    d=request.json or {}
    if not d.get("name"): return jsonify(error="Medicine name is required"),400
    with engine.begin() as c:
        c.execute(text("""
          INSERT INTO medicines(name,generic,company,category,batch,expiry,purchase,price,stock,min_stock)
          VALUES(:name,:generic,:company,:category,:batch,NULLIF(:expiry,'')::date,:purchase,:price,:stock,:min_stock)
        """), {
          "name":d.get("name",""),"generic":d.get("generic",""),"company":d.get("company",""),
          "category":d.get("category",""),"batch":d.get("batch",""),"expiry":d.get("expiry",""),
          "purchase":float(d.get("purchase") or 0),"price":float(d.get("price") or 0),
          "stock":int(d.get("stock") or 0),"min_stock":int(d.get("min_stock") or 10)
        })
    return jsonify(ok=True)

@app.put("/api/medicines/<int:mid>")
def edit_medicine(mid):
    d=request.json or {}
    with engine.begin() as c:
        r=c.execute(text("""
          UPDATE medicines SET name=:name,generic=:generic,company=:company,category=:category,
          batch=:batch,expiry=NULLIF(:expiry,'')::date,purchase=:purchase,price=:price,
          stock=:stock,min_stock=:min_stock WHERE id=:id
        """), {
          "id":mid,"name":d.get("name",""),"generic":d.get("generic",""),"company":d.get("company",""),
          "category":d.get("category",""),"batch":d.get("batch",""),"expiry":d.get("expiry",""),
          "purchase":float(d.get("purchase") or 0),"price":float(d.get("price") or 0),
          "stock":int(d.get("stock") or 0),"min_stock":int(d.get("min_stock") or 10)
        })
        if r.rowcount==0: return jsonify(error="Medicine not found"),404
    return jsonify(ok=True)

@app.delete("/api/medicines/<int:mid>")
def delete_medicine(mid):
    with engine.begin() as c:
        c.execute(text("DELETE FROM medicines WHERE id=:id"), {"id":mid})
    return jsonify(ok=True)

@app.post("/api/sales")
def sale():
    d=request.json or {}; items=d.get("items",[])
    if not items: return jsonify(error="Cart is empty"),400
    invoice="INV-"+datetime.now().strftime("%Y%m%d%H%M%S%f")
    try:
        with engine.begin() as c:
            total=0
            checked=[]
            for x in items:
                r=c.execute(text("SELECT id,name,price,stock FROM medicines WHERE id=:id FOR UPDATE"),
                             {"id":int(x["id"])}).mappings().first()
                if not r: raise ValueError("Medicine not found")
                qty=int(x["qty"])
                if qty<=0 or qty>r["stock"]: raise ValueError(f"Insufficient stock: {r['name']}")
                total += float(r["price"])*qty
                checked.append((r,qty))
            sid=c.execute(text("""
              INSERT INTO sales(invoice,customer,total,created_at)
              VALUES(:invoice,:customer,:total,:created_at) RETURNING id
            """), {"invoice":invoice,"customer":d.get("customer") or "Walk-in",
                   "total":total,"created_at":datetime.now()}).scalar_one()
            for r,qty in checked:
                c.execute(text("""INSERT INTO sale_items(sale_id,medicine_id,quantity,price)
                                  VALUES(:sid,:mid,:qty,:price)"""),
                          {"sid":sid,"mid":r["id"],"qty":qty,"price":r["price"]})
                c.execute(text("UPDATE medicines SET stock=stock-:qty WHERE id=:id"),
                          {"qty":qty,"id":r["id"]})
        return jsonify(ok=True,invoice=invoice,total=total)
    except ValueError as e:
        return jsonify(error=str(e)),400
    except SQLAlchemyError:
        return jsonify(error="Sale could not be completed"),500

@app.post("/api/purchases")
def purchase():
    d=request.json or {}
    try:
        with engine.begin() as c:
            r=c.execute(text("SELECT id FROM medicines WHERE id=:id FOR UPDATE"), {"id":int(d["medicine_id"])}).first()
            if not r: return jsonify(error="Medicine not found"),404
            c.execute(text("""UPDATE medicines SET stock=stock+:qty,purchase=:price,
                              batch=:batch,expiry=NULLIF(:expiry,'')::date WHERE id=:id"""),
                      {"qty":int(d["quantity"]),"price":float(d.get("purchase_price") or 0),
                       "batch":d.get("batch",""),"expiry":d.get("expiry",""),"id":int(d["medicine_id"])})
            c.execute(text("""INSERT INTO purchases(medicine_id,supplier,batch,expiry,quantity,purchase_price,created_at)
                              VALUES(:mid,:supplier,:batch,NULLIF(:expiry,'')::date,:qty,:price,:now)"""),
                      {"mid":int(d["medicine_id"]),"supplier":d.get("supplier",""),"batch":d.get("batch",""),
                       "expiry":d.get("expiry",""),"qty":int(d["quantity"]),
                       "price":float(d.get("purchase_price") or 0),"now":datetime.now()})
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(error=str(e)),400

@app.get("/api/reports/sales")
def sales_report():
    with engine.connect() as c:
        rows=c.execute(text("SELECT * FROM sales ORDER BY id DESC LIMIT 500")).mappings().all()
    return jsonify([dict(r) for r in rows])

@app.get("/api/reports/stock")
def stock_report():
    with engine.connect() as c:
        rows=c.execute(text("""
          SELECT * FROM medicines
          WHERE stock<=min_stock OR (expiry IS NOT NULL AND expiry<=CURRENT_DATE+INTERVAL '90 day')
          ORDER BY expiry NULLS LAST
        """)).mappings().all()
    return jsonify([dict(r) for r in rows])

@app.get("/api/export")
def export_csv():
    with engine.connect() as c:
        rows=c.execute(text("SELECT * FROM medicines ORDER BY name")).mappings().all()
    out=io.StringIO(); w=csv.writer(out)
    w.writerow(["Name","Generic","Company","Category","Batch","Expiry","Purchase","Selling","Stock","Min Stock"])
    for r in rows:
        w.writerow([r["name"],r["generic"],r["company"],r["category"],r["batch"],r["expiry"],
                    r["purchase"],r["price"],r["stock"],r["min_stock"]])
    return send_file(io.BytesIO(out.getvalue().encode("utf-8-sig")),
                     mimetype="text/csv",as_attachment=True,download_name="pharmacy_stock.csv")

init_db()

if __name__=="__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT","5000")))

import os
import io
import csv
import json
import secrets
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

from flask import (
    Flask, render_template, request, jsonify,
    send_file, session, redirect
)
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError


app = Flask(__name__)

app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://pharma:pharma@localhost:5432/pharmacy"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

BD = ZoneInfo("Asia/Dhaka")


# =========================================================
# BANGLADESH TIME
# =========================================================

def bd_now():
    return datetime.now(BD)


def bd_today():
    return bd_now().date()


def bd_now_naive():
    return bd_now().replace(tzinfo=None)


# =========================================================
# DATABASE
# =========================================================

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

CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS medicine_batches(
    id SERIAL PRIMARY KEY,
    medicine_id INTEGER REFERENCES medicines(id) ON DELETE CASCADE,
    batch TEXT NOT NULL DEFAULT '',
    expiry DATE,
    purchase_price NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    UNIQUE(medicine_id, batch)
);

CREATE TABLE IF NOT EXISTS stock_movements(
    id SERIAL PRIMARY KEY,
    medicine_id INTEGER REFERENCES medicines(id),
    batch_id INTEGER REFERENCES medicine_batches(id),
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reference TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL,
    username TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs(
    id SERIAL PRIMARY KEY,
    username TEXT DEFAULT '',
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL
);

"""


def init_db():
    with engine.begin() as conn:

        for statement in SCHEMA.strip().split(";"):
            if statement.strip():
                conn.execute(text(statement))

        # Existing-table migrations
        conn.execute(text("""
            ALTER TABLE sales
            ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0
        """))

        conn.execute(text("""
            ALTER TABLE sales
            ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0
        """))

      # Create or reset the initial admin account
username = os.environ.get("ADMIN_USERNAME", "admin")
password = os.environ.get("ADMIN_PASSWORD", "admin123")

existing_admin = conn.execute(
    text("""
        SELECT id
        FROM users
        WHERE username=:username
    """),
    {"username": username}
).first()

if existing_admin:
    conn.execute(
        text("""
            UPDATE users
            SET
                password_hash=:password,
                role='admin',
                active=TRUE
            WHERE username=:username
        """),
        {
            "username": username,
            "password": generate_password_hash(password)
        }
    )
else:
    conn.execute(
        text("""
            INSERT INTO users
            (username,password_hash,role,active,created_at)
            VALUES(:username,:password,'admin',TRUE,:now)
        """),
        {
            "username": username,
            "password": generate_password_hash(password),
            "now": bd_now_naive()
        }
    )

    # Migrate existing medicine records into batch tracking.
    medicines = conn.execute(
            text("""
                SELECT id,batch,expiry,purchase,price,stock
                FROM medicines
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM medicine_batches mb
                    WHERE mb.medicine_id = medicines.id
                )
            """)
        ).mappings().all()

        for m in medicines:
            conn.execute(
                text("""
                    INSERT INTO medicine_batches
                    (
                        medicine_id,batch,expiry,
                        purchase_price,selling_price,
                        stock,created_at
                    )
                    VALUES(
                        :medicine_id,:batch,:expiry,
                        :purchase,:price,
                        :stock,:now
                    )
                    ON CONFLICT(medicine_id,batch) DO NOTHING
                """),
                {
                    "medicine_id": m["id"],
                    "batch": m["batch"] or "",
                    "expiry": m["expiry"],
                    "purchase": m["purchase"] or 0,
                    "price": m["price"] or 0,
                    "stock": m["stock"] or 0,
                    "now": bd_now_naive()
                }
            )


# =========================================================
# AUTHENTICATION
# =========================================================

def current_user():
    uid = session.get("user_id")

    if not uid:
        return None

    with engine.connect() as c:
        return c.execute(
            text("""
                SELECT id,username,role,active
                FROM users
                WHERE id=:id
            """),
            {"id": uid}
        ).mappings().first()


def login_required():
    return current_user() is not None


def admin_required():
    user = current_user()
    return user and user["role"] == "admin"


def log_action(action, details=""):
    user = current_user()
    username = user["username"] if user else ""

    with engine.begin() as c:
        c.execute(
            text("""
                INSERT INTO audit_logs
                (username,action,details,created_at)
                VALUES(:username,:action,:details,:now)
            """),
            {
                "username": username,
                "action": action,
                "details": details,
                "now": bd_now_naive()
            }
        )


# =========================================================
# LOGIN
# =========================================================

@app.get("/login")
def login_page():
    if current_user():
        return redirect("/")
    return render_template("index.html")


@app.post("/api/login")
def login():
    data = request.json or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    with engine.connect() as c:
        user = c.execute(
            text("""
                SELECT *
                FROM users
                WHERE username=:username
                AND active=TRUE
            """),
            {"username": username}
        ).mappings().first()

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        return jsonify(error="Invalid username or password"), 401

    session.clear()
    session["user_id"] = user["id"]

    log_action("LOGIN", "Successful login")

    return jsonify(
        ok=True,
        username=user["username"],
        role=user["role"]
    )


@app.post("/api/logout")
def logout():
    user = current_user()

    if user:
        log_action("LOGOUT")

    session.clear()

    return jsonify(ok=True)


@app.get("/api/me")
def me():
    user = current_user()

    if not user:
        return jsonify(logged_in=False)

    return jsonify(
        logged_in=True,
        username=user["username"],
        role=user["role"]
    )


# =========================================================
# MAIN
# =========================================================

@app.route("/")
def index():

    if not current_user():
        return render_template("index.html")

    return render_template("index.html")


@app.get("/health")
def health():

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        return jsonify(
            status="ok",
            database="connected"
        )

    except Exception:
        return jsonify(
            status="error",
            database="unavailable"
        ), 503


@app.get("/api/time")
def api_time():

    now = bd_now()

    return jsonify(
        timezone="Asia/Dhaka",
        utc_offset="+06:00",
        date=now.strftime("%Y-%m-%d"),
        time=now.strftime("%H:%M:%S")
    )


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/api/dashboard")
def dashboard():

    if not login_required():
        return jsonify(error="Login required"), 401

    today = bd_today()

    with engine.connect() as c:

        total_products = c.execute(
            text("SELECT COUNT(*) FROM medicines")
        ).scalar()

        stock = c.execute(
            text("SELECT COALESCE(SUM(stock),0) FROM medicines")
        ).scalar()

        value = c.execute(
            text("""
                SELECT COALESCE(SUM(stock*purchase),0)
                FROM medicines
            """)
        ).scalar()

        low = c.execute(
            text("""
                SELECT COUNT(*)
                FROM medicines
                WHERE stock <= min_stock
            """)
        ).scalar()

        expired = c.execute(
            text("""
                SELECT COUNT(*)
                FROM medicines
                WHERE expiry IS NOT NULL
                AND expiry < :today
            """),
            {"today": today}
        ).scalar()

        near_expiry = c.execute(
            text("""
                SELECT COUNT(*)
                FROM medicines
                WHERE expiry IS NOT NULL
                AND expiry >= :today
                AND expiry <= :future
            """),
            {
                "today": today,
                "future": today + timedelta(days=90)
            }
        ).scalar()

        today_sales = c.execute(
            text("""
                SELECT COALESCE(SUM(total),0)
                FROM sales
                WHERE created_at::date=:today
            """),
            {"today": today}
        ).scalar()

    return jsonify(
        total_products=int(total_products),
        stock=int(stock),
        value=float(value or 0),
        low=int(low),
        expired=int(expired),
        near_expiry=int(near_expiry),
        today=float(today_sales or 0)
    )


# =========================================================
# MEDICINES
# =========================================================

@app.get("/api/medicines")
def medicines():

    if not login_required():
        return jsonify(error="Login required"), 401

    q = request.args.get("q", "").strip()

    with engine.connect() as c:

        if q:
            rows = c.execute(
                text("""
                    SELECT *
                    FROM medicines
                    WHERE name ILIKE :q
                    OR generic ILIKE :q
                    OR company ILIKE :q
                    OR category ILIKE :q
                    OR batch ILIKE :q
                    ORDER BY name
                """),
                {"q": f"%{q}%"}
            ).mappings().all()

        else:
            rows = c.execute(
                text("""
                    SELECT *
                    FROM medicines
                    ORDER BY name
                """)
            ).mappings().all()

    return jsonify([dict(r) for r in rows])


@app.post("/api/medicines")
def add_medicine():

    if not login_required():
        return jsonify(error="Login required"), 401

    d = request.json or {}

    if not d.get("name"):
        return jsonify(error="Medicine name is required"), 400

    try:

        with engine.begin() as c:

            mid = c.execute(
                text("""
                    INSERT INTO medicines
                    (
                        name,generic,company,category,
                        batch,expiry,purchase,price,
                        stock,min_stock
                    )
                    VALUES(
                        :name,:generic,:company,:category,
                        :batch,NULLIF(:expiry,'')::date,
                        :purchase,:price,:stock,:min_stock
                    )
                    RETURNING id
                """),
                {
                    "name": d.get("name", ""),
                    "generic": d.get("generic", ""),
                    "company": d.get("company", ""),
                    "category": d.get("category", ""),
                    "batch": d.get("batch", ""),
                    "expiry": d.get("expiry", ""),
                    "purchase": float(d.get("purchase") or 0),
                    "price": float(d.get("price") or 0),
                    "stock": int(d.get("stock") or 0),
                    "min_stock": int(d.get("min_stock") or 10)
                }
            ).scalar_one()

            if int(d.get("stock") or 0) > 0:
                c.execute(
                    text("""
                        INSERT INTO medicine_batches
                        (
                            medicine_id,batch,expiry,
                            purchase_price,selling_price,
                            stock,created_at
                        )
                        VALUES(
                            :mid,:batch,
                            NULLIF(:expiry,'')::date,
                            :purchase,:price,
                            :stock,:now
                        )
                    """),
                    {
                        "mid": mid,
                        "batch": d.get("batch", ""),
                        "expiry": d.get("expiry", ""),
                        "purchase": float(d.get("purchase") or 0),
                        "price": float(d.get("price") or 0),
                        "stock": int(d.get("stock") or 0),
                        "now": bd_now_naive()
                    }
                )

        log_action("ADD_MEDICINE", d.get("name", ""))

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


@app.put("/api/medicines/<int:mid>")
def edit_medicine(mid):

    if not login_required():
        return jsonify(error="Login required"), 401

    d = request.json or {}

    try:

        with engine.begin() as c:

            r = c.execute(
                text("""
                    UPDATE medicines
                    SET
                        name=:name,
                        generic=:generic,
                        company=:company,
                        category=:category,
                        batch=:batch,
                        expiry=NULLIF(:expiry,'')::date,
                        purchase=:purchase,
                        price=:price,
                        stock=:stock,
                        min_stock=:min_stock
                    WHERE id=:id
                """),
                {
                    "id": mid,
                    "name": d.get("name", ""),
                    "generic": d.get("generic", ""),
                    "company": d.get("company", ""),
                    "category": d.get("category", ""),
                    "batch": d.get("batch", ""),
                    "expiry": d.get("expiry", ""),
                    "purchase": float(d.get("purchase") or 0),
                    "price": float(d.get("price") or 0),
                    "stock": int(d.get("stock") or 0),
                    "min_stock": int(d.get("min_stock") or 10)
                }
            )

            if r.rowcount == 0:
                return jsonify(error="Medicine not found"), 404

        log_action("EDIT_MEDICINE", str(mid))

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


@app.delete("/api/medicines/<int:mid>")
def delete_medicine(mid):

    if not admin_required():
        return jsonify(error="Admin access required"), 403

    try:

        with engine.begin() as c:

            c.execute(
                text("""
                    DELETE FROM medicine_batches
                    WHERE medicine_id=:id
                """),
                {"id": mid}
            )

            r = c.execute(
                text("""
                    DELETE FROM medicines
                    WHERE id=:id
                """),
                {"id": mid}
            )

            if r.rowcount == 0:
                return jsonify(error="Medicine not found"), 404

        log_action("DELETE_MEDICINE", str(mid))

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


# =========================================================
# BATCHES
# =========================================================

@app.get("/api/medicines/<int:mid>/batches")
def medicine_batches(mid):

    if not login_required():
        return jsonify(error="Login required"), 401

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT *
                FROM medicine_batches
                WHERE medicine_id=:mid
                ORDER BY expiry NULLS LAST, id
            """),
            {"mid": mid}
        ).mappings().all()

    return jsonify([dict(r) for r in rows])


# =========================================================
# PURCHASE / STOCK IN
# =========================================================

@app.post("/api/purchases")
def purchase():

    if not login_required():
        return jsonify(error="Login required"), 401

    d = request.json or {}

    try:

        mid = int(d["medicine_id"])
        qty = int(d["quantity"])

        if qty <= 0:
            raise ValueError("Quantity must be greater than zero")

        price = float(d.get("purchase_price") or 0)
        batch = d.get("batch", "")
        expiry = d.get("expiry", "")

        with engine.begin() as c:

            medicine = c.execute(
                text("""
                    SELECT *
                    FROM medicines
                    WHERE id=:id
                    FOR UPDATE
                """),
                {"id": mid}
            ).mappings().first()

            if not medicine:
                return jsonify(error="Medicine not found"), 404

            batch_row = c.execute(
                text("""
                    SELECT id
                    FROM medicine_batches
                    WHERE medicine_id=:mid
                    AND batch=:batch
                    FOR UPDATE
                """),
                {
                    "mid": mid,
                    "batch": batch
                }
            ).first()

            if batch_row:

                c.execute(
                    text("""
                        UPDATE medicine_batches
                        SET
                            stock=stock+:qty,
                            purchase_price=:price,
                            expiry=NULLIF(:expiry,'')::date
                        WHERE id=:id
                    """),
                    {
                        "qty": qty,
                        "price": price,
                        "expiry": expiry,
                        "id": batch_row[0]
                    }
                )

                batch_id = batch_row[0]

            else:

                batch_id = c.execute(
                    text("""
                        INSERT INTO medicine_batches
                        (
                            medicine_id,batch,expiry,
                            purchase_price,selling_price,
                            stock,created_at
                        )
                        VALUES(
                            :mid,:batch,
                            NULLIF(:expiry,'')::date,
                            :purchase,:selling,
                            :qty,:now
                        )
                        RETURNING id
                    """),
                    {
                        "mid": mid,
                        "batch": batch,
                        "expiry": expiry,
                        "purchase": price,
                        "selling": medicine["price"],
                        "qty": qty,
                        "now": bd_now_naive()
                    }
                ).scalar_one()

            c.execute(
                text("""
                    UPDATE medicines
                    SET
                        stock=stock+:qty,
                        purchase=:price,
                        batch=:batch,
                        expiry=NULLIF(:expiry,'')::date
                    WHERE id=:id
                """),
                {
                    "qty": qty,
                    "price": price,
                    "batch": batch,
                    "expiry": expiry,
                    "id": mid
                }
            )

            c.execute(
                text("""
                    INSERT INTO purchases
                    (
                        medicine_id,supplier,batch,
                        expiry,quantity,purchase_price,created_at
                    )
                    VALUES(
                        :mid,:supplier,:batch,
                        NULLIF(:expiry,'')::date,
                        :qty,:price,:now
                    )
                """),
                {
                    "mid": mid,
                    "supplier": d.get("supplier", ""),
                    "batch": batch,
                    "expiry": expiry,
                    "qty": qty,
                    "price": price,
                    "now": bd_now_naive()
                }
            )

            user = current_user()

            c.execute(
                text("""
                    INSERT INTO stock_movements
                    (
                        medicine_id,batch_id,
                        movement_type,quantity,
                        reference,note,
                        created_at,username
                    )
                    VALUES(
                        :mid,:batch_id,
                        'STOCK_IN',:qty,
                        'PURCHASE',:supplier,
                        :now,:username
                    )
                """),
                {
                    "mid": mid,
                    "batch_id": batch_id,
                    "qty": qty,
                    "supplier": d.get("supplier", ""),
                    "now": bd_now_naive(),
                    "username": user["username"]
                }
            )

        log_action("STOCK_IN", f"Medicine {mid}, Qty {qty}")

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


# =========================================================
# SALES
# =========================================================

@app.post("/api/sales")
def sale():

    if not login_required():
        return jsonify(error="Login required"), 401

    d = request.json or {}
    items = d.get("items", [])

    if not items:
        return jsonify(error="Cart is empty"), 400

    invoice = "INV-" + bd_now().strftime("%Y%m%d%H%M%S%f")

    discount = float(d.get("discount") or 0)

    try:

        with engine.begin() as c:

            subtotal = 0
            checked = []

            for item in items:

                mid = int(item["id"])
                qty = int(item["qty"])

                if qty <= 0:
                    raise ValueError("Invalid quantity")

                medicine = c.execute(
                    text("""
                        SELECT id,name,price,stock
                        FROM medicines
                        WHERE id=:id
                        FOR UPDATE
                    """),
                    {"id": mid}
                ).mappings().first()

                if not medicine:
                    raise ValueError("Medicine not found")

                if qty > medicine["stock"]:
                    raise ValueError(
                        f"Insufficient stock: {medicine['name']}"
                    )

                subtotal += float(medicine["price"]) * qty

                checked.append(
                    (medicine, qty)
                )

            if discount < 0:
                discount = 0

            if discount > subtotal:
                discount = subtotal

            total = subtotal - discount

            sid = c.execute(
                text("""
                    INSERT INTO sales
                    (
                        invoice,customer,
                        subtotal,discount,total,
                        created_at
                    )
                    VALUES(
                        :invoice,:customer,
                        :subtotal,:discount,:total,
                        :created_at
                    )
                    RETURNING id
                """),
                {
                    "invoice": invoice,
                    "customer": d.get("customer") or "Walk-in",
                    "subtotal": subtotal,
                    "discount": discount,
                    "total": total,
                    "created_at": bd_now_naive()
                }
            ).scalar_one()

            user = current_user()

            for medicine, qty in checked:

                remaining = qty

                # FEFO: sell earliest expiry first
                batches = c.execute(
                    text("""
                        SELECT *
                        FROM medicine_batches
                        WHERE medicine_id=:mid
                        AND stock>0
                        ORDER BY expiry NULLS LAST, id
                        FOR UPDATE
                    """),
                    {"mid": medicine["id"]}
                ).mappings().all()

                for batch in batches:

                    if remaining <= 0:
                        break

                    take = min(
                        remaining,
                        batch["stock"]
                    )

                    c.execute(
                        text("""
                            UPDATE medicine_batches
                            SET stock=stock-:qty
                            WHERE id=:id
                        """),
                        {
                            "qty": take,
                            "id": batch["id"]
                        }
                    )

                    c.execute(
                        text("""
                            INSERT INTO sale_items
                            (
                                sale_id,medicine_id,
                                quantity,price
                            )
                            VALUES(
                                :sid,:mid,
                                :qty,:price
                            )
                        """),
                        {
                            "sid": sid,
                            "mid": medicine["id"],
                            "qty": take,
                            "price": medicine["price"]
                        }
                    )

                    c.execute(
                        text("""
                            INSERT INTO stock_movements
                            (
                                medicine_id,batch_id,
                                movement_type,quantity,
                                reference,note,
                                created_at,username
                            )
                            VALUES(
                                :mid,:batch_id,
                                'SALE',:qty,
                                :invoice,'',
                                :now,:username
                            )
                        """),
                        {
                            "mid": medicine["id"],
                            "batch_id": batch["id"],
                            "qty": take,
                            "invoice": invoice,
                            "now": bd_now_naive(),
                            "username": user["username"]
                        }
                    )

                    remaining -= take

                if remaining > 0:
                    raise ValueError(
                        f"Batch stock problem: {medicine['name']}"
                    )

                c.execute(
                    text("""
                        UPDATE medicines
                        SET stock=stock-:qty
                        WHERE id=:id
                    """),
                    {
                        "qty": qty,
                        "id": medicine["id"]
                    }
                )

        log_action("SALE", invoice)

        return jsonify(
            ok=True,
            invoice=invoice,
            subtotal=subtotal,
            discount=discount,
            total=total
        )

    except ValueError as e:
        return jsonify(error=str(e)), 400

    except SQLAlchemyError:
        return jsonify(
            error="Sale could not be completed"
        ), 500


# =========================================================
# SALES REPORT
# =========================================================

@app.get("/api/reports/sales")
def sales_report():

    if not login_required():
        return jsonify(error="Login required"), 401

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT *
                FROM sales
                ORDER BY id DESC
                LIMIT 500
            """)
        ).mappings().all()

    return jsonify([dict(r) for r in rows])


@app.get("/api/sales/<invoice>")
def get_sale(invoice):

    if not login_required():
        return jsonify(error="Login required"), 401

    with engine.connect() as c:

        sale_row = c.execute(
            text("""
                SELECT *
                FROM sales
                WHERE invoice=:invoice
            """),
            {"invoice": invoice}
        ).mappings().first()

        if not sale_row:
            return jsonify(error="Invoice not found"), 404

        items = c.execute(
            text("""
                SELECT
                    si.*,
                    m.name,
                    m.generic
                FROM sale_items si
                JOIN medicines m
                    ON m.id=si.medicine_id
                WHERE si.sale_id=:sid
                ORDER BY si.id
            """),
            {"sid": sale_row["id"]}
        ).mappings().all()

    return jsonify(
        sale=dict(sale_row),
        items=[dict(x) for x in items]
    )


# =========================================================
# STOCK REPORT
# =========================================================

@app.get("/api/reports/stock")
def stock_report():

    if not login_required():
        return jsonify(error="Login required"), 401

    today = bd_today()

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT *
                FROM medicines
                WHERE stock<=min_stock
                OR (
                    expiry IS NOT NULL
                    AND expiry<=:future
                )
                ORDER BY expiry NULLS LAST
            """),
            {
                "future": today + timedelta(days=90)
            }
        ).mappings().all()

    return jsonify([dict(r) for r in rows])


# =========================================================
# STOCK MOVEMENTS
# =========================================================

@app.get("/api/stock-movements")
def stock_movements():

    if not login_required():
        return jsonify(error="Login required"), 401

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT
                    sm.*,
                    m.name,
                    mb.batch
                FROM stock_movements sm
                JOIN medicines m
                    ON m.id=sm.medicine_id
                LEFT JOIN medicine_batches mb
                    ON mb.id=sm.batch_id
                ORDER BY sm.id DESC
                LIMIT 500
            """)
        ).mappings().all()

    return jsonify([dict(r) for r in rows])


# =========================================================
# USERS
# =========================================================

@app.get("/api/users")
def users():

    if not admin_required():
        return jsonify(error="Admin access required"), 403

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT id,username,role,active,created_at
                FROM users
                ORDER BY username
            """)
        ).mappings().all()

    return jsonify([dict(r) for r in rows])


@app.post("/api/users")
def add_user():

    if not admin_required():
        return jsonify(error="Admin access required"), 403

    d = request.json or {}

    username = str(d.get("username", "")).strip()
    password = str(d.get("password", ""))
    role = d.get("role", "staff")

    if not username or not password:
        return jsonify(
            error="Username and password are required"
        ), 400

    if role not in ("admin", "staff"):
        role = "staff"

    try:

        with engine.begin() as c:

            c.execute(
                text("""
                    INSERT INTO users
                    (
                        username,password_hash,
                        role,active,created_at
                    )
                    VALUES(
                        :username,:password,
                        :role,TRUE,:now
                    )
                """),
                {
                    "username": username,
                    "password": generate_password_hash(password),
                    "role": role,
                    "now": bd_now_naive()
                }
            )

        log_action("ADD_USER", username)

        return jsonify(ok=True)

    except Exception as e:
        return jsonify(error=str(e)), 400


@app.delete("/api/users/<int:uid>")
def delete_user(uid):

    if not admin_required():
        return jsonify(error="Admin access required"), 403

    me_user = current_user()

    if uid == me_user["id"]:
        return jsonify(
            error="You cannot delete your own account"
        ), 400

    with engine.begin() as c:

        c.execute(
            text("""
                UPDATE users
                SET active=FALSE
                WHERE id=:id
            """),
            {"id": uid}
        )

    log_action("DISABLE_USER", str(uid))

    return jsonify(ok=True)


# =========================================================
# BACKUP
# =========================================================

@app.get("/api/backup")
def backup():

    if not admin_required():
        return jsonify(error="Admin access required"), 403

    tables = [
        "users",
        "medicines",
        "medicine_batches",
        "sales",
        "sale_items",
        "purchases",
        "stock_movements",
        "audit_logs"
    ]

    backup_data = {
        "application": "PharmaStock",
        "version": "2.0",
        "timezone": "Asia/Dhaka",
        "created_at": bd_now().isoformat(),
        "tables": {}
    }

    with engine.connect() as c:

        for table in tables:

            rows = c.execute(
                text(f"SELECT * FROM {table}")
            ).mappings().all()

            converted = []

            for row in rows:

                item = {}

                for key, value in dict(row).items():

                    if isinstance(value, (datetime, date)):
                        item[key] = value.isoformat()

                    else:
                        item[key] = value

                converted.append(item)

            backup_data["tables"][table] = converted

    data = json.dumps(
        backup_data,
        ensure_ascii=False,
        indent=2,
        default=str
    ).encode("utf-8")

    filename = (
        "pharmastock-backup-"
        + bd_now().strftime("%Y-%m-%d-%H%M%S")
        + ".json"
    )

    log_action("BACKUP", filename)

    return send_file(
        io.BytesIO(data),
        mimetype="application/json",
        as_attachment=True,
        download_name=filename
    )


# =========================================================
# CSV EXPORT
# =========================================================

@app.get("/api/export")
def export_csv():

    if not login_required():
        return jsonify(error="Login required"), 401

    with engine.connect() as c:

        rows = c.execute(
            text("""
                SELECT *
                FROM medicines
                ORDER BY name
            """)
        ).mappings().all()

    out = io.StringIO()

    writer = csv.writer(out)

    writer.writerow([
        "Name",
        "Generic",
        "Company",
        "Category",
        "Batch",
        "Expiry",
        "Purchase",
        "Selling",
        "Stock",
        "Min Stock"
    ])

    for r in rows:

        writer.writerow([
            r["name"],
            r["generic"],
            r["company"],
            r["category"],
            r["batch"],
            r["expiry"],
            r["purchase"],
            r["price"],
            r["stock"],
            r["min_stock"]
        ])

    return send_file(
        io.BytesIO(
            out.getvalue().encode("utf-8-sig")
        ),
        mimetype="text/csv",
        as_attachment=True,
        download_name="pharmacy_stock.csv"
    )


# =========================================================
# STARTUP
# =========================================================

init_db()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000"))
    )

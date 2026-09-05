import os
import io
import csv
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

from flask import Flask, render_template, request, jsonify, send_file
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError


app = Flask(__name__)


# ============================================================
# BANGLADESH TIMEZONE
# ============================================================

BANGLADESH_TZ = ZoneInfo("Asia/Dhaka")


def bd_now():
    """
    Returns the current date and time in Bangladesh.
    Example:
    2026-09-06 00:30:15+06:00
    """
    return datetime.now(BANGLADESH_TZ)


def bd_today():
    """
    Returns today's date according to Bangladesh time.
    """
    return bd_now().date()


def bd_now_naive():
    """
    Returns Bangladesh time without timezone information.

    Your existing PostgreSQL database uses TIMESTAMP (without
    timezone), so we store Bangladesh local time in that column.
    """
    return bd_now().replace(tzinfo=None)


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://pharma:pharma@localhost:5432/pharmacy"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)


# ============================================================
# DATABASE SCHEMA
# ============================================================

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


# ============================================================
# MAIN PAGE
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


# ============================================================
# HEALTH CHECK
# ============================================================

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


# ============================================================
# BANGLADESH TIME TEST ENDPOINT
# ============================================================

@app.get("/api/time")
def current_time():
    """
    Allows you to verify the application's Bangladesh time.

    Open:
    https://your-app.onrender.com/api/time
    """

    now = bd_now()

    return jsonify(
        timezone="Asia/Dhaka",
        utc_offset="+06:00",
        date=now.strftime("%Y-%m-%d"),
        time=now.strftime("%H:%M:%S"),
        datetime=now.strftime("%Y-%m-%d %H:%M:%S"),
        display=now.strftime("%d/%m/%Y %I:%M:%S %p")
    )


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/api/dashboard")
def dashboard():

    # IMPORTANT:
    # Use Bangladesh's current date instead of PostgreSQL
    # CURRENT_DATE because the Render server may use UTC.

    today = bd_today()

    with engine.connect() as c:

        total_products = c.execute(
            text("SELECT COUNT(*) FROM medicines")
        ).scalar()

        stock = c.execute(
            text("SELECT COALESCE(SUM(stock),0) FROM medicines")
        ).scalar()

        value = c.execute(
            text(
                "SELECT COALESCE(SUM(stock * purchase),0) "
                "FROM medicines"
            )
        ).scalar()

        low = c.execute(
            text(
                "SELECT COUNT(*) FROM medicines "
                "WHERE stock <= min_stock"
            )
        ).scalar()

        expired = c.execute(
            text(
                """
                SELECT COUNT(*)
                FROM medicines
                WHERE expiry IS NOT NULL
                AND expiry < :today
                """
            ),
            {
                "today": today
            }
        ).scalar()

        today_sales = c.execute(
            text(
                """
                SELECT COALESCE(SUM(total),0)
                FROM sales
                WHERE created_at >= :start
                AND created_at < :end
                """
            ),
            {
                "start": datetime.combine(today, datetime.min.time()),
                "end": datetime.combine(
                    today + timedelta(days=1),
                    datetime.min.time()
                )
            }
        ).scalar()

    return jsonify(
        total_products=int(total_products or 0),
        stock=int(stock or 0),
        value=float(value or 0),
        low=int(low or 0),
        expired=int(expired or 0),
        today=float(today_sales or 0)
    )


# ============================================================
# MEDICINES
# ============================================================

@app.get("/api/medicines")
def medicines():

    q = request.args.get("q", "").strip()

    with engine.connect() as c:

        if q:

            rows = c.execute(
                text(
                    """
                    SELECT *
                    FROM medicines
                    WHERE name ILIKE :q
                       OR generic ILIKE :q
                       OR company ILIKE :q
                       OR batch ILIKE :q
                    ORDER BY name
                    """
                ),
                {
                    "q": f"%{q}%"
                }
            ).mappings().all()

        else:

            rows = c.execute(
                text(
                    """
                    SELECT *
                    FROM medicines
                    ORDER BY name
                    """
                )
            ).mappings().all()

    return jsonify([dict(r) for r in rows])


@app.post("/api/medicines")
def add_medicine():

    d = request.json or {}

    if not d.get("name"):
        return jsonify(
            error="Medicine name is required"
        ), 400

    try:

        with engine.begin() as c:

            c.execute(
                text(
                    """
                    INSERT INTO medicines(
                        name,
                        generic,
                        company,
                        category,
                        batch,
                        expiry,
                        purchase,
                        price,
                        stock,
                        min_stock
                    )
                    VALUES(
                        :name,
                        :generic,
                        :company,
                        :category,
                        :batch,
                        NULLIF(:expiry,'')::date,
                        :purchase,
                        :price,
                        :stock,
                        :min_stock
                    )
                    """
                ),
                {
                    "name": d.get("name", ""),
                    "generic": d.get("generic", ""),
                    "company": d.get("company", ""),
                    "category": d.get("category", ""),
                    "batch": d.get("batch", ""),
                    "expiry": d.get("expiry", ""),
                    "purchase": float(
                        d.get("purchase") or 0
                    ),
                    "price": float(
                        d.get("price") or 0
                    ),
                    "stock": int(
                        d.get("stock") or 0
                    ),
                    "min_stock": int(
                        d.get("min_stock") or 10
                    )
                }
            )

        return jsonify(ok=True)

    except Exception as e:

        return jsonify(
            error=str(e)
        ), 400


@app.put("/api/medicines/<int:mid>")
def edit_medicine(mid):

    d = request.json or {}

    try:

        with engine.begin() as c:

            r = c.execute(
                text(
                    """
                    UPDATE medicines
                    SET
                        name = :name,
                        generic = :generic,
                        company = :company,
                        category = :category,
                        batch = :batch,
                        expiry = NULLIF(:expiry,'')::date,
                        purchase = :purchase,
                        price = :price,
                        stock = :stock,
                        min_stock = :min_stock
                    WHERE id = :id
                    """
                ),
                {
                    "id": mid,
                    "name": d.get("name", ""),
                    "generic": d.get("generic", ""),
                    "company": d.get("company", ""),
                    "category": d.get("category", ""),
                    "batch": d.get("batch", ""),
                    "expiry": d.get("expiry", ""),
                    "purchase": float(
                        d.get("purchase") or 0
                    ),
                    "price": float(
                        d.get("price") or 0
                    ),
                    "stock": int(
                        d.get("stock") or 0
                    ),
                    "min_stock": int(
                        d.get("min_stock") or 10
                    )
                }
            )

            if r.rowcount == 0:
                return jsonify(
                    error="Medicine not found"
                ), 404

        return jsonify(ok=True)

    except Exception as e:

        return jsonify(
            error=str(e)
        ), 400


@app.delete("/api/medicines/<int:mid>")
def delete_medicine(mid):

    try:

        with engine.begin() as c:

            c.execute(
                text(
                    "DELETE FROM medicines WHERE id=:id"
                ),
                {
                    "id": mid
                }
            )

        return jsonify(ok=True)

    except Exception as e:

        return jsonify(
            error=str(e)
        ), 400


# ============================================================
# SALES
# ============================================================

@app.post("/api/sales")
def sale():

    d = request.json or {}
    items = d.get("items", [])

    if not items:
        return jsonify(
            error="Cart is empty"
        ), 400

    # Bangladesh timestamp
    now = bd_now_naive()

    # Example:
    # INV-20260906003045123456
    invoice = "INV-" + now.strftime(
        "%Y%m%d%H%M%S%f"
    )

    try:

        with engine.begin() as c:

            total = 0
            checked = []

            # Check every medicine while locking the rows.
            for x in items:

                r = c.execute(
                    text(
                        """
                        SELECT
                            id,
                            name,
                            price,
                            stock
                        FROM medicines
                        WHERE id=:id
                        FOR UPDATE
                        """
                    ),
                    {
                        "id": int(x["id"])
                    }
                ).mappings().first()

                if not r:
                    raise ValueError(
                        "Medicine not found"
                    )

                qty = int(x["qty"])

                if qty <= 0:
                    raise ValueError(
                        f"Invalid quantity: {r['name']}"
                    )

                if qty > r["stock"]:
                    raise ValueError(
                        f"Insufficient stock: {r['name']}"
                    )

                total += float(r["price"]) * qty

                checked.append(
                    (r, qty)
                )

            # Create sale
            sid = c.execute(
                text(
                    """
                    INSERT INTO sales(
                        invoice,
                        customer,
                        total,
                        created_at
                    )
                    VALUES(
                        :invoice,
                        :customer,
                        :total,
                        :created_at
                    )
                    RETURNING id
                    """
                ),
                {
                    "invoice": invoice,
                    "customer": (
                        d.get("customer")
                        or "Walk-in"
                    ),
                    "total": total,
                    "created_at": now
                }
            ).scalar_one()

            # Create sale items
            for r, qty in checked:

                c.execute(
                    text(
                        """
                        INSERT INTO sale_items(
                            sale_id,
                            medicine_id,
                            quantity,
                            price
                        )
                        VALUES(
                            :sid,
                            :mid,
                            :qty,
                            :price
                        )
                        """
                    ),
                    {
                        "sid": sid,
                        "mid": r["id"],
                        "qty": qty,
                        "price": r["price"]
                    }
                )

                # Deduct stock
                c.execute(
                    text(
                        """
                        UPDATE medicines
                        SET stock = stock - :qty
                        WHERE id = :id
                        """
                    ),
                    {
                        "qty": qty,
                        "id": r["id"]
                    }
                )

        return jsonify(
            ok=True,
            invoice=invoice,
            total=total,
            datetime=now.strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            timezone="Asia/Dhaka"
        )

    except ValueError as e:

        return jsonify(
            error=str(e)
        ), 400

    except SQLAlchemyError:

        return jsonify(
            error="Sale could not be completed"
        ), 500


# ============================================================
# PURCHASE / STOCK-IN
# ============================================================

@app.post("/api/purchases")
def purchase():

    d = request.json or {}

    try:

        medicine_id = int(
            d["medicine_id"]
        )

        quantity = int(
            d["quantity"]
        )

        if quantity <= 0:
            return jsonify(
                error="Quantity must be greater than zero"
            ), 400

        purchase_price = float(
            d.get("purchase_price") or 0
        )

        # Bangladesh timestamp
        now = bd_now_naive()

        with engine.begin() as c:

            r = c.execute(
                text(
                    """
                    SELECT id
                    FROM medicines
                    WHERE id=:id
                    FOR UPDATE
                    """
                ),
                {
                    "id": medicine_id
                }
            ).first()

            if not r:
                return jsonify(
                    error="Medicine not found"
                ), 404

            # Add stock and update current purchase details.
            c.execute(
                text(
                    """
                    UPDATE medicines
                    SET
                        stock = stock + :qty,
                        purchase = :price,
                        batch = :batch,
                        expiry = NULLIF(
                            :expiry,
                            ''
                        )::date
                    WHERE id=:id
                    """
                ),
                {
                    "qty": quantity,
                    "price": purchase_price,
                    "batch": d.get(
                        "batch",
                        ""
                    ),
                    "expiry": d.get(
                        "expiry",
                        ""
                    ),
                    "id": medicine_id
                }
            )

            # Record purchase history.
            c.execute(
                text(
                    """
                    INSERT INTO purchases(
                        medicine_id,
                        supplier,
                        batch,
                        expiry,
                        quantity,
                        purchase_price,
                        created_at
                    )
                    VALUES(
                        :mid,
                        :supplier,
                        :batch,
                        NULLIF(
                            :expiry,
                            ''
                        )::date,
                        :qty,
                        :price,
                        :now
                    )
                    """
                ),
                {
                    "mid": medicine_id,
                    "supplier": d.get(
                        "supplier",
                        ""
                    ),
                    "batch": d.get(
                        "batch",
                        ""
                    ),
                    "expiry": d.get(
                        "expiry",
                        ""
                    ),
                    "qty": quantity,
                    "price": purchase_price,
                    "now": now
                }
            )

        return jsonify(
            ok=True,
            datetime=now.strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            timezone="Asia/Dhaka"
        )

    except Exception as e:

        return jsonify(
            error=str(e)
        ), 400


# ============================================================
# SALES REPORT
# ============================================================

@app.get("/api/reports/sales")
def sales_report():

    with engine.connect() as c:

        rows = c.execute(
            text(
                """
                SELECT *
                FROM sales
                ORDER BY id DESC
                LIMIT 500
                """
            )
        ).mappings().all()

    return jsonify(
        [dict(r) for r in rows]
    )


# ============================================================
# STOCK / EXPIRY REPORT
# ============================================================

@app.get("/api/reports/stock")
def stock_report():

    # Bangladesh date
    today = bd_today()

    # 90-day expiry alert period
    expiry_limit = today + timedelta(
        days=90
    )

    with engine.connect() as c:

        rows = c.execute(
            text(
                """
                SELECT *
                FROM medicines
                WHERE stock <= min_stock
                   OR (
                       expiry IS NOT NULL
                       AND expiry <= :expiry_limit
                   )
                ORDER BY expiry NULLS LAST
                """
            ),
            {
                "expiry_limit": expiry_limit
            }
        ).mappings().all()

    return jsonify(
        [dict(r) for r in rows]
    )


# ============================================================
# CSV EXPORT
# ============================================================

@app.get("/api/export")
def export_csv():

    with engine.connect() as c:

        rows = c.execute(
            text(
                """
                SELECT *
                FROM medicines
                ORDER BY name
                """
            )
        ).mappings().all()

    out = io.StringIO()

    writer = csv.writer(out)

    writer.writerow(
        [
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
        ]
    )

    for r in rows:

        writer.writerow(
            [
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
            ]
        )

    return send_file(
        io.BytesIO(
            out.getvalue().encode(
                "utf-8-sig"
            )
        ),
        mimetype="text/csv",
        as_attachment=True,
        download_name="pharmacy_stock.csv"
    )


# ============================================================
# STARTUP
# ============================================================

init_db()


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(
            os.environ.get(
                "PORT",
                "5000"
            )
        )
    )

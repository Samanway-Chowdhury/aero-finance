import os
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker
from backend.database import Base
from backend.models import User, Profile, Financial, Transaction, Goal, Bill, Budget

# SQLite local engine
sqlite_engine = create_engine("sqlite:///./aerofinance.db")
SqliteSession = sessionmaker(bind=sqlite_engine)
sqlite_session = SqliteSession()

# Cloud SQL PostgreSQL engine (using the public IP authorized network)
POSTGRES_URL = "postgresql+psycopg2://postgres:aero_postgres_pass_2026@34.59.137.253:5432/postgres"
pg_engine = create_engine(POSTGRES_URL)
PgSession = sessionmaker(bind=pg_engine)
pg_session = PgSession()

def migrate():
    print("Creating tables in PostgreSQL if they do not exist...")
    Base.metadata.create_all(pg_engine)

    # Tables to migrate in order of dependency
    tables = [
        (User, "users"),
        (Profile, "profiles"),
        (Financial, "financials"),
        (Transaction, "transactions"),
        (Goal, "goals"),
        (Bill, "bills"),
        (Budget, "budgets"),
    ]

    for model, name in tables:
        print(f"Migrating table: {name}...")
        # Clear existing data in PG to prevent duplicates/conflicts on re-run
        pg_session.query(model).delete()
        pg_session.commit()

        # Read from SQLite
        items = sqlite_session.query(model).all()
        print(f"Found {len(items)} rows in SQLite for {name}.")

        # Insert into PG
        for item in items:
            # We construct a new instance with the same dictionary representation
            # but detached from the SQLite session
            attrs = {c.name: getattr(item, c.name) for c in model.__table__.columns}
            new_item = model(**attrs)
            pg_session.add(new_item)
        
        pg_session.commit()
        print(f"Successfully migrated {len(items)} rows to PostgreSQL table {name}.")

        # Reset serial sequence
        print(f"Resetting auto-increment sequence for {name}...")
        seq_name = f"{name}_id_seq"
        pg_session.execute(
            text(f"SELECT setval('{seq_name}', COALESCE((SELECT MAX(id) FROM {name}), 1), true)")
        )
        pg_session.commit()

    print("Database migration completed successfully!")

if __name__ == "__main__":
    migrate()

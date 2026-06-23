from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "app_users"
    
    id = Column(Integer, primary_key=True, index=True)
    account_number = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False)
    financial = relationship("Financial", back_populates="user", uselist=False)
    transactions = relationship("Transaction", back_populates="user")
    goals = relationship("Goal", back_populates="user")
    bills = relationship("Bill", back_populates="user")
    budgets = relationship("Budget", back_populates="user")

class Profile(Base):
    __tablename__ = "profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    name = Column(String)
    age = Column(Integer)
    nationality = Column(String)
    currency_code = Column(String)
    bank_name = Column(String)
    
    user = relationship("User", back_populates="profile")

class Financial(Base):
    __tablename__ = "financials"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    cr_number = Column(String)
    balance = Column(Numeric(12, 2, asdecimal=False), default=0.0)
    hysa_balance = Column(Numeric(12, 2, asdecimal=False), default=0.0)
    hysa_last_compounded = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", back_populates="financial")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    # TIMESTAMP WITH TIMEZONE for precise cross-timezone velocity tracking
    timestamp = Column(DateTime(timezone=True))
    description = Column(String)
    category = Column(String)
    amount = Column(Numeric(12, 2, asdecimal=False))
    tx_type = Column(String) # 'income' or 'expense'
    
    user = relationship("User", back_populates="transactions")

# Explicit index on user_id FK for fast velocity lookups
Index("ix_transactions_user_id_timestamp", Transaction.user_id, Transaction.timestamp)

class Goal(Base):
    __tablename__ = "goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    name = Column(String)
    target = Column(Numeric(12, 2, asdecimal=False))
    current = Column(Numeric(12, 2, asdecimal=False))
    color = Column(String)
    priority = Column(Integer)
    
    user = relationship("User", back_populates="goals")

class Bill(Base):
    __tablename__ = "bills"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    name = Column(String)
    amount = Column(Numeric(12, 2, asdecimal=False))
    billing_date = Column(String)
    auto_pay = Column(Boolean, default=False)
    alert = Column(String, nullable=True)
    alert_msg = Column(String, nullable=True)
    status = Column(String, nullable=True)
    
    user = relationship("User", back_populates="bills")

class Budget(Base):
    __tablename__ = "budgets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id"), index=True)
    
    category = Column(String)
    budget_limit = Column(Numeric(12, 2, asdecimal=False))
    spent = Column(Numeric(12, 2, asdecimal=False), default=0.0)
    
    user = relationship("User", back_populates="budgets")

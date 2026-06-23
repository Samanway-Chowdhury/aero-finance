from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from dotenv import load_dotenv
from google import genai
from google.genai import types
import os
import random
from pydantic import BaseModel
from typing import List

from .database import engine, Base, get_db
from .models import User, Profile, Financial, Transaction, Goal, Bill, Budget

# Create database tables
Base.metadata.create_all(bind=engine)

def check_db_columns():
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE financials ADD COLUMN hysa_balance FLOAT DEFAULT 0.0"))
            conn.commit()
            print("Added hysa_balance column to financials table")
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE financials ADD COLUMN hysa_last_compounded TIMESTAMP"))
            conn.commit()
            print("Added hysa_last_compounded column to financials table")
        except Exception:
            pass

check_db_columns()

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
API_KEY = os.getenv("GEMINI_API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY", "aero_finance_secret_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if API_KEY and API_KEY != "your_api_key_here":
    client = genai.Client(api_key=API_KEY)
else:
    client = None

# Pydantic models for Gemini response schemas
class GoalAdjustment(BaseModel):
    id: int
    name: str
    target: float
    current: float
    color: str
    priority: int

class GoalAdjustmentResponse(BaseModel):
    adjusted_goals: List[GoalAdjustment]

class BudgetRecalculationResponse(BaseModel):
    Dining: int
    Shopping: int
    Groceries: int
    Utilities: int
    Entertainment: int

class CommandPayload(BaseModel):
    navigation_target: str = None
    transaction_desc: str = None
    transaction_category: str = None
    transaction_amount: float = None
    transaction_type: str = None
    goal_name: str = None
    goal_target: float = None
    goal_current: float = None
    goal_color: str = None
    goal_priority: int = None
    goal_action: str = None

class GeminiCommandResponse(BaseModel):
    intent_action: str
    payload: CommandPayload

def compound_hysa(financial, db: Session):
    if not financial:
        return
    
    if not hasattr(financial, 'hysa_balance') or financial.hysa_balance is None:
        return
    
    now = datetime.now(timezone.utc)
    if financial.hysa_last_compounded is None:
        financial.hysa_last_compounded = now
        db.commit()
        return

    last_compounded = financial.hysa_last_compounded
    if last_compounded.tzinfo is None:
        last_compounded = last_compounded.replace(tzinfo=timezone.utc)
        
    delta = now - last_compounded
    days = delta.total_seconds() / 86400.0
    if days > 0 and financial.hysa_balance > 0:
        growth_factor = (1.0525) ** (days / 365.0)
        financial.hysa_balance = round(financial.hysa_balance * growth_factor, 4)
        financial.hysa_last_compounded = now
        db.commit()

def check_spending_velocity(db: Session, user_id: int):
    now = datetime.now(timezone.utc)
    three_days_ago = now - timedelta(days=3)
    thirty_days_ago = now - timedelta(days=30)
    
    expenses = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.tx_type == 'expense',
        Transaction.timestamp >= thirty_days_ago
    ).all()
    
    sum_3d = 0.0
    sum_30d = 0.0
    for tx in expenses:
        tx_time = tx.timestamp
        if tx_time.tzinfo is None:
            tx_time = tx_time.replace(tzinfo=timezone.utc)
        amount = float(tx.amount)
        sum_30d += amount
        if tx_time >= three_days_ago:
            sum_3d += amount
            
    vel_3d = sum_3d / 3.0
    vel_30d = sum_30d / 30.0
    
    if vel_30d > 0.0 and vel_3d >= 1.5 * vel_30d:
        return True, vel_3d, vel_30d
    return False, vel_3d, vel_30d

app = FastAPI(title="Aero Finance Backend")

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_state(self, user_id: int):
        if user_id in self.active_connections:
            from .database import SessionLocal
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    balance = user.financial.balance if user.financial else 0.0
                    hysa_balance = user.financial.hysa_balance if (user.financial and hasattr(user.financial, 'hysa_balance')) else 0.0
                    active_bills_sum = sum(b.amount for b in user.bills if b.status != 'cancellation_pending')
                    goal_allotments_sum = sum(max(0.0, (g.target - g.current) / 12.0) for g in user.goals)
                    safe_to_spend = max(0.0, balance - (active_bills_sum + goal_allotments_sum))
                else:
                    safe_to_spend = 0.0
                    hysa_balance = 0.0
            except Exception:
                safe_to_spend = 0.0
                hysa_balance = 0.0
            finally:
                db.close()
                
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json({"event": "state_update", "safe_to_spend": safe_to_spend, "hysa_balance": hysa_balance})
                except Exception:
                    self.disconnect(user_id, connection)

manager = ConnectionManager()

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    if not token:
        token = websocket.query_params.get("token")
    
    if not token:
        await websocket.close(code=1008)
        return
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        account_number: str = payload.get("sub")
        if account_number is None:
            await websocket.close(code=1008)
            return
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return
    
    from .database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.account_number == account_number).first()
        if not user:
            await websocket.close(code=1008)
            return
        user_id = user.id
    finally:
        db.close()
        
    await manager.connect(user_id, websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        account_number: str = payload.get("sub")
        if account_number is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = db.query(User).filter(User.account_number == account_number).first()
    if user is None:
        raise credentials_exception
    return user

# Ensure frontend directory exists and is absolute path
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/app", StaticFiles(directory=frontend_dir, html=True), name="frontend")

@app.get("/")
def root():
    return RedirectResponse(url="/app/index.html")

# --- Auth Endpoints ---

@app.post("/api/auth/signup")
async def signup(data: dict, db: Session = Depends(get_db)):
    # Check if user exists
    if db.query(User).filter(User.account_number == data['accountNumber']).first():
        raise HTTPException(status_code=400, detail="Account number already registered")
    
    # Create User
    new_user = User(
        account_number=data['accountNumber'],
        hashed_password=get_password_hash(data['password'])
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create Profile
    currency_map = { 'US': 'USD', 'UK': 'GBP', 'EU': 'EUR', 'IN': 'INR', 'JP': 'JPY' }
    new_profile = Profile(
        user_id=new_user.id,
        name=data['name'],
        age=data['age'],
        nationality=data['nationality'],
        currency_code=currency_map.get(data['nationality'], 'USD'),
        bank_name=data['bank']
    )
    
    # Create Financial Record
    new_financial = Financial(
        user_id=new_user.id,
        cr_number=data['crNumber'],
        balance=24500.75 # Default starting balance for demo
    )
    
    # Add dummy goals, budgets, and bills
    dummy_goals = [
        Goal(user_id=new_user.id, name='Emergency Fund', target=20000, current=8000, color='#3b82f6', priority=1),
        Goal(user_id=new_user.id, name='Tesla Model 3', target=45000, current=15000, color='#14F195', priority=2)
    ]
    
    dummy_budgets = [
        Budget(user_id=new_user.id, category='Dining', budget_limit=500, spent=450),
        Budget(user_id=new_user.id, category='Shopping', budget_limit=300, spent=200),
        Budget(user_id=new_user.id, category='Groceries', budget_limit=400, spent=380)
    ]
 
    dummy_bills = [
        Bill(user_id=new_user.id, name='Netflix', amount=15.99, billing_date='10', auto_pay=True),
        Bill(user_id=new_user.id, name='Gym', amount=45.00, billing_date='15', auto_pay=True),
        Bill(user_id=new_user.id, name='Electricity', amount=120.00, billing_date='28', auto_pay=False,
             alert='PRICE_HIKE', alert_msg='Electricity bill increased by 15%.')
    ]

    import random as _rnd
    from datetime import date as _date, timedelta as _td
    tx_cats = [
        ('Dining',        ['Sushi Bistro', 'Starbucks', 'Pizza Palace', 'Thai Garden'], 'expense'),
        ('Shopping',      ['Amazon', 'Apple Store', 'Nike', 'IKEA'], 'expense'),
        ('Groceries',     ['Whole Foods', "Trader Joe's", 'Costco', 'Walmart'], 'expense'),
        ('Utilities',     ['Electric Bill', 'Internet', 'Gas Bill', 'Phone Bill'], 'expense'),
        ('Entertainment', ['Netflix', 'Spotify', 'Cinema Ticket', 'Steam Games'], 'expense'),
        ('Salary',        ['Monthly Salary', 'Freelance Payment', 'Bonus', 'Dividend'], 'income'),
    ]
    dummy_transactions = []
    today = _date.today()
    for i in range(29, -1, -1):
        day = today - _td(days=i)
        dt = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
        # Salary on day 29 and 14
        if i in (29, 14):
            dummy_transactions.append(Transaction(
                user_id=new_user.id, timestamp=dt,
                description='Monthly Salary', category='Salary',
                amount=round(_rnd.uniform(3500, 5500), 2), tx_type='income'
            ))
        # 1-2 expense transactions per day
        for _ in range(_rnd.randint(1, 2)):
            cat_entry = tx_cats[_rnd.randint(0, len(tx_cats) - 2)]  # exclude Salary
            cat, descs, tx_type = cat_entry
            dummy_transactions.append(Transaction(
                user_id=new_user.id, timestamp=dt,
                description=_rnd.choice(descs), category=cat,
                amount=round(_rnd.uniform(10, 180), 2), tx_type=tx_type
            ))
    
    db.add(new_profile)
    db.add(new_financial)
    for g in dummy_goals: db.add(g)
    for b in dummy_budgets: db.add(b)
    for bl in dummy_bills: db.add(bl)
    for tx in dummy_transactions: db.add(tx)
    
    db.commit()
    return {"status": "success", "message": "User created successfully"}

@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.account_number == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user.account_number})
    return {"access_token": access_token, "token_type": "bearer"}

# --- Data Endpoints ---

@app.post("/api/user/goal")
async def add_goal(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_goal = Goal(
        user_id=current_user.id,
        name=data['name'],
        target=float(data['target']),
        current=float(data.get('current', 0)),
        color=data.get('color', '#14F195'),
        priority=int(data.get('priority', 1))
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    await manager.broadcast_state(current_user.id)
    return {"status": "success", "goal": {"id": new_goal.id, "name": new_goal.name}}

@app.delete("/api/user/goal/{goal_id}")
async def delete_goal(goal_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == current_user.id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
    await manager.broadcast_state(current_user.id)
    return {"status": "success"}

@app.patch("/api/user/financial")
async def update_financial(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    financial = current_user.financial
    if 'balance' in data:
        financial.balance = float(data['balance'])
    if 'cr_number' in data:
        financial.cr_number = data['cr_number']
    db.commit()
    await manager.broadcast_state(current_user.id)
    return {"status": "success", "balance": financial.balance}

@app.get("/api/user/data")
async def get_user_data(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = current_user.profile
    financial = current_user.financial
    
    if financial:
        compound_hysa(financial, db)
        
    # Sorted chronologically by the database layer using 'ORDER BY timestamp ASC'
    tx_list = db.query(Transaction).filter(Transaction.user_id == current_user.id).order_by(Transaction.timestamp.asc()).all()
    
    return {
        "user": {
            "name": profile.name,
            "age": profile.age,
            "nationality": profile.nationality,
            "currencyCode": profile.currency_code,
            "bank": profile.bank_name,
            "balance": financial.balance if financial else 0.0,
            "hysa_balance": financial.hysa_balance if (financial and hasattr(financial, 'hysa_balance')) else 0.0
        },
        "transactions": [
            {
                "id": t.id,
                "date": t.timestamp.strftime("%Y-%m-%d") if t.timestamp else "",
                "description": t.description,
                "category": t.category,
                "amount": t.amount,
                "type": t.tx_type
            }
            for t in tx_list
        ],
        "goals": [
            {"id": g.id, "name": g.name, "target": g.target, "current": g.current, "color": g.color, "priority": g.priority}
            for g in current_user.goals
        ],
        "budgets": [
            {"category": b.category, "spent": b.spent, "limit": b.budget_limit}
            for b in current_user.budgets
        ],
        "bills": [
            {
                "name": b.name,
                "amount": b.amount,
                "date": b.billing_date,
                "autoPay": b.auto_pay,
                "alert": b.alert,
                "alertMsg": b.alert_msg,
                "status": b.status
            }
            for b in current_user.bills
        ]
    }

@app.post("/api/goals/adjust")
async def adjust_goals(data: dict, current_user: User = Depends(get_current_user)):
    """Use AI to re-prioritise and slightly adjust goal targets based on user balance."""
    goals = data.get("goals", [])
    if not client:
        return {"adjusted_goals": goals}
    try:
        import json as _json
        financial = current_user.financial
        prompt = f"""You are a financial AI. A user has balance {financial.balance} and the following savings goals: {_json.dumps(goals)}.
        Slightly adjust the 'current' allocation amounts to be more realistic. Do NOT change goal names or targets."""
        
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GoalAdjustmentResponse,
        )
        
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=config
        )
        
        res_data = _json.loads(response.text)
        if "adjusted_goals" in res_data:
            return res_data
    except Exception:
        pass
    return {"adjusted_goals": goals}

@app.post("/api/chat")
async def chat_endpoint(data: dict, current_user: User = Depends(get_current_user)):
    text = data.get("text", "")
    
    if not client:
        return {"reply": "Aero Finance AI offline: No API key."}
        
    try:
        system_prompt = f"""You are Aero Finance AI. User: {current_user.profile.name}. Balance: {current_user.financial.balance}. Goals: {[g.name for g in current_user.goals]}. Query: {text}"""
        response = client.models.generate_content(model=MODEL_NAME, contents=system_prompt)
        return {"reply": response.text}
    except Exception as e:
        return {"reply": f"Error: {str(e)}"}

@app.post("/api/user/transaction")
async def create_transaction(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Create Transaction
    new_tx = Transaction(
        user_id=current_user.id,
        timestamp=datetime.now(timezone.utc),
        description=data['description'],
        category=data['category'],
        amount=float(data['amount']),
        tx_type=data['type']
    )
    db.add(new_tx)
    
    # Update Balance and Budget
    amount = float(data['amount'])
    if data['type'] == 'income':
        current_user.financial.balance += amount
    else:
        current_user.financial.balance -= amount
        # Update budget spent for the category
        budget = db.query(Budget).filter(Budget.user_id == current_user.id, Budget.category == data['category']).first()
        if budget:
            budget.spent += amount
    
    db.commit()
    
    # Check spending velocity alert
    triggered, vel_3d, vel_30d = check_spending_velocity(db, current_user.id)
    if triggered:
        for connection in list(manager.active_connections.get(current_user.id, [])):
            try:
                await connection.send_json({
                    "event": "velocity_alert",
                    "message": f"Anomalous spending velocity detected! 3-day average velocity ({vel_3d:.2f}) is {vel_3d/vel_30d:.1f}x higher than 30-day baseline ({vel_30d:.2f})."
                })
            except Exception:
                pass

    await manager.broadcast_state(current_user.id)
    return {"status": "success", "balance": current_user.financial.balance}

@app.post("/api/user/sweep")
async def execute_hysa_sweep(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    amount = float(data.get("amount", 0.0))
    financial = current_user.financial
    if not financial:
        raise HTTPException(status_code=400, detail="Financial record not found")
        
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid sweep amount")
        
    # Check safety buffer
    if financial.balance - amount < 500.0:
        raise HTTPException(status_code=400, detail="Sweep exceeds safety buffer of $500")
        
    # Perform interest compounding before sweep to keep records consistent
    compound_hysa(financial, db)
    
    financial.balance -= amount
    if not hasattr(financial, 'hysa_balance') or financial.hysa_balance is None:
        financial.hysa_balance = 0.0
    financial.hysa_balance += amount
    
    db.commit()
    await manager.broadcast_state(current_user.id)
    return {
        "status": "success",
        "balance": financial.balance,
        "hysa_balance": financial.hysa_balance
    }

@app.post("/api/command/execute")
async def execute_command(data: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    text_query = data.get("text", "")
    if not text_query:
        raise HTTPException(status_code=400, detail="Empty query")
        
    parsed = None
    if client:
        try:
            prompt = f"""
            You are Aero Finance Command Bar Assistant. Parse the following command text into the appropriate schema action:
            Command: "{text_query}"
            
            Actions supported:
            1. NAVIGATION: Go to a tab. Targets: dashboard, transactions, budgeting, bills, goals.
               Example: "go to goals" or "show budgeting" or "open dashboard"
            2. TRANSACTION_MUTATION: Add a new transaction (income/expense).
               Example: "log dining expense of 45 dollars for dinner" -> type='expense', category='Dining', amount=45.0, description='Dinner'
            3. GOAL_MUTATION: Create or delete a goal.
               Example: "create savings goal Tesla with target 50000" -> goal_action='create', goal_name='Tesla', goal_target=50000.0
            """
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiCommandResponse,
            )
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=config
            )
            import json
            parsed_data = json.loads(response.text)
            parsed = GeminiCommandResponse(**parsed_data)
        except Exception as e:
            print("Gemini command parsing error:", e)
            parsed = None

    if not parsed:
        # Fallback dict structure if Gemini API call fails or is unreachable
        fallback_dict = {
            "intent_action": "UNKNOWN",
            "payload": {
                "navigation_target": None,
                "transaction_desc": None,
                "transaction_category": None,
                "transaction_amount": None,
                "transaction_type": None,
                "goal_name": None,
                "goal_target": None,
                "goal_current": None,
                "goal_color": None,
                "goal_priority": None,
                "goal_action": None
            }
        }
        parsed = GeminiCommandResponse(**fallback_dict)

    response_msg = ""
    target_view = None
    
    intent = parsed.intent_action
    payload = parsed.payload
    
    if intent == "NAVIGATION":
        target_view = payload.navigation_target
        response_msg = f"Navigated to {target_view}."
        
    elif intent == "TRANSACTION_MUTATION":
        if payload.transaction_amount is None or not payload.transaction_desc:
            raise HTTPException(status_code=400, detail="Missing transaction details")
        
        new_tx = Transaction(
            user_id=current_user.id,
            timestamp=datetime.now(timezone.utc),
            description=payload.transaction_desc,
            category=payload.transaction_category or "Other",
            amount=payload.transaction_amount,
            tx_type=payload.transaction_type or "expense"
        )
        db.add(new_tx)
        
        if new_tx.tx_type == 'income':
            current_user.financial.balance += new_tx.amount
        else:
            current_user.financial.balance -= new_tx.amount
            budget = db.query(Budget).filter(Budget.user_id == current_user.id, Budget.category == new_tx.category).first()
            if budget:
                budget.spent += new_tx.amount
        db.commit()
        
        # Check spending velocity
        triggered, vel_3d, vel_30d = check_spending_velocity(db, current_user.id)
        if triggered:
            for connection in list(manager.active_connections.get(current_user.id, [])):
                try:
                    await connection.send_json({
                        "event": "velocity_alert",
                        "message": f"Anomalous spending velocity detected! 3-day average ({vel_3d:.2f}) is {vel_3d/vel_30d:.1f}x higher than 30-day baseline ({vel_30d:.2f})."
                    })
                except Exception:
                    pass
        
        await manager.broadcast_state(current_user.id)
        response_msg = f"Logged {new_tx.tx_type} transaction: '{new_tx.description}' for ${new_tx.amount:.2f}."
        
    elif intent == "GOAL_MUTATION":
        if payload.goal_action == "delete":
            goal = db.query(Goal).filter(
                Goal.user_id == current_user.id, 
                Goal.name.like(f"%{payload.goal_name}%")
            ).first()
            if goal:
                db.delete(goal)
                db.commit()
                response_msg = f"Terminated goal vector: '{goal.name}'."
            else:
                response_msg = f"Goal matching '{payload.goal_name}' not found."
        else:
            new_goal = Goal(
                user_id=current_user.id,
                name=payload.goal_name or "New Goal",
                target=payload.goal_target or 1000.0,
                current=payload.goal_current or 0.0,
                color=payload.goal_color or "#14F195",
                priority=len(current_user.goals) + 1
            )
            db.add(new_goal)
            db.commit()
            response_msg = f"Launched goal vector: '{new_goal.name}' with target ${new_goal.target:.2f}."
            
        await manager.broadcast_state(current_user.id)
        
    else:
        response_msg = "Command not recognized. Try 'go to goals', 'spend $50 on dining for dinner', or 'create goal vacation target 3000'."
        
    return {
        "status": "success",
        "action": intent,
        "message": response_msg,
        "target": target_view
    }

@app.post("/api/user/budget/recalculate")
async def recalculate_budget(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fallback_limits = {
        "Dining": 400,
        "Shopping": 250,
        "Groceries": 350,
        "Utilities": 150,
        "Entertainment": 200
    }
    
    new_limits = None
    
    if client:
        try:
            import json
            financial = current_user.financial
            goals = [f"{g.name} (Target: {g.target}, Current: {g.current})" for g in current_user.goals]
            
            prompt = f"""
            User: {current_user.profile.name}
            Current Balance: {financial.balance}
            Goals: {goals}
            
            Please suggest a monthly budget allocation across these categories: Dining, Shopping, Groceries, Utilities, Entertainment.
            """
            
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BudgetRecalculationResponse,
            )
            
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=config
            )
            
            new_limits = json.loads(response.text)
        except Exception:
            new_limits = fallback_limits
    else:
        new_limits = fallback_limits

    if not new_limits:
        new_limits = fallback_limits

    # Update or create budgets in DB
    try:
        for cat, limit in new_limits.items():
            existing = db.query(Budget).filter(Budget.user_id == current_user.id, Budget.category == cat).first()
            if existing:
                existing.budget_limit = float(limit)
            else:
                db.add(Budget(user_id=current_user.id, category=cat, budget_limit=float(limit), spent=0))
        db.commit()
    except Exception:
        db.rollback()
        
    await manager.broadcast_state(current_user.id)
    return {"suggested_budgets": new_limits}

async def run_daily_hysa_simulation():
    import asyncio
    from .database import SessionLocal
    while True:
        try:
            # Sleep for 1 day (86400 seconds)
            await asyncio.sleep(86400)
            
            db = SessionLocal()
            try:
                users = db.query(User).all()
                for user in users:
                    financial = user.financial
                    if not financial:
                        continue
                    
                    # 1. Compound HYSA
                    compound_hysa(financial, db)
                    
                    # 2. Auto-sweep safe-to-spend surplus above $500 safety buffer
                    balance = financial.balance
                    active_bills_sum = sum(b.amount for b in user.bills if b.status != 'cancellation_pending')
                    goal_allotments_sum = sum(max(0.0, (g.target - g.current) / 12.0) for g in user.goals)
                    safe_to_spend = max(0.0, balance - active_bills_sum - goal_allotments_sum)
                    
                    surplus = safe_to_spend - 500.0
                    if surplus > 0:
                        # Sweep surplus from balance to HYSA
                        financial.balance -= surplus
                        if not hasattr(financial, 'hysa_balance') or financial.hysa_balance is None:
                            financial.hysa_balance = 0.0
                        financial.hysa_balance += surplus
                        db.commit()
                        
                        # Notify user via websocket if connected
                        await manager.broadcast_state(user.id)
            except Exception as e:
                print("Error in HYSA daily simulation background task:", e)
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print("Error in daily simulation loop:", e)
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    import asyncio
    asyncio.create_task(run_daily_hysa_simulation())

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    # Using 'backend.main:app' since we run as a module from the root directory
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)

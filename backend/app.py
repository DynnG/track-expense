"""Track Expense API. Run: python -m uvicorn backend.app:app --reload."""
import csv
import hashlib
import io
import json
import logging
import os
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, create_engine, delete, event, func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from starlette.middleware.trustedhost import TrustedHostMiddleware

PRODUCTION = os.getenv('APP_ENV') == 'production'
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./track_expense.db')
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql+psycopg://', 1)
elif DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)
ORIGIN = os.getenv('FRONTEND_ORIGIN', 'http://127.0.0.1:5173').rstrip('/')
if PRODUCTION and (DATABASE_URL.startswith('sqlite') or not ORIGIN.startswith('https://')):
    raise RuntimeError('Production requires PostgreSQL and an HTTPS FRONTEND_ORIGIN.')
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {})
if DATABASE_URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def sqlite_constraints(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
logger = logging.getLogger('track_expense')
logging.basicConfig(level=logging.INFO, format='%(message)s')
DEFAULTS = [('Food & drinks', 'EXPENSE'), ('Transport', 'EXPENSE'), ('Bills & utilities', 'EXPENSE'), ('Shopping', 'EXPENSE'), ('Education', 'EXPENSE'), ('Health', 'EXPENSE'), ('Other', 'EXPENSE'), ('Salary', 'INCOME'), ('Allowance', 'INCOME'), ('Other income', 'INCOME')]

class SafeAccessLog(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            args[2] = str(args[2]).split('?')[0]
            record.args = tuple(args)
        return True

logging.getLogger('uvicorn.access').addFilter(SafeAccessLog())

class Base(DeclarativeBase):
    pass

def uid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    password_hash: Mapped[str] = mapped_column(String(255))

class LoginSession(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    created: Mapped[int] = mapped_column(Integer)
    touched: Mapped[int] = mapped_column(Integer)

class Category(Base):
    __tablename__ = 'categories'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(60))
    type: Mapped[str] = mapped_column(String(7))
    __table_args__ = (UniqueConstraint('user_id', 'name'), CheckConstraint("type IN ('INCOME', 'EXPENSE')"))

class Transaction(Base):
    __tablename__ = 'transactions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    category_id: Mapped[str] = mapped_column(ForeignKey('categories.id'))
    type: Mapped[str] = mapped_column(String(7))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    description: Mapped[str] = mapped_column(String(200), default='')
    transaction_date: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[str] = mapped_column(String(40), default=lambda: datetime.now(timezone.utc).isoformat())
    __table_args__ = (CheckConstraint('amount > 0 AND amount <= 9999999999.99'), CheckConstraint("type IN ('INCOME', 'EXPENSE')"), Index('ix_tx_user_date', 'user_id', 'transaction_date'))

class Budget(Base):
    __tablename__ = 'budgets'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    # Empty string denotes the overall budget; avoids nullable unique constraints.
    category_id: Mapped[str] = mapped_column(String(36), default='')
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    month: Mapped[str] = mapped_column(String(7))
    __table_args__ = (UniqueConstraint('user_id', 'category_id', 'month'), CheckConstraint('amount > 0 AND amount <= 9999999999.99'))

class RateBucket(Base):
    __tablename__ = 'rate_buckets'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    hits: Mapped[int] = mapped_column(Integer, default=0)
    expires: Mapped[int] = mapped_column(Integer)

class RecoveryToken(Base):
    __tablename__ = 'recovery_tokens'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    expires: Mapped[int] = mapped_column(Integer)

class AuditEvent(Base):
    __tablename__ = 'audit_events'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[str] = mapped_column(String(40), default=lambda: datetime.now(timezone.utc).isoformat())

@asynccontextmanager
async def lifespan(application):
    if not PRODUCTION:
        Base.metadata.create_all(engine)
    yield

app = FastAPI(title='Track Expense API', version='1.0.0', lifespan=lifespan, docs_url=None if PRODUCTION else '/api/docs', openapi_url=None if PRODUCTION else '/api/openapi.json')
if PRODUCTION:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=[ORIGIN.split('/')[2]])

def db():
    with Session(engine) as session:
        yield session

def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()

def throttle(session: Session, key: str, limit: int, window: int):
    """Database-backed atomic counter, shared across API processes."""
    now = int(time.time())
    bucket = digest(key + ':' + str(now // window))
    dialect = engine.dialect.name
    if dialect == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    statement = insert(RateBucket).values(key=bucket, hits=1, expires=(now // window + 1) * window)
    statement = statement.on_conflict_do_update(index_elements=['key'], set_={'hits': RateBucket.hits + 1}).returning(RateBucket.hits)
    hits = session.execute(statement).scalar_one()
    session.commit()
    if hits > limit:
        raise HTTPException(429, 'Too many requests. Please try again later.', headers={'Retry-After': str(window - now % window)})

@app.middleware('http')
async def security(request: Request, call_next):
    request_id = uid()
    start = time.monotonic()
    response = None
    try:
        if int(request.headers.get('content-length', '0')) > 16384:
            response = JSONResponse({'error': {'code': 'BODY_TOO_LARGE', 'message': 'Request is too large.'}}, status_code=413)
        elif request.method in ('POST', 'PATCH', 'PUT') and len(await request.body()) > 16384:
            response = JSONResponse({'error': {'code': 'BODY_TOO_LARGE', 'message': 'Request is too large.'}}, status_code=413)
        elif request.method in ('POST', 'PATCH', 'PUT', 'DELETE') and request.headers.get('origin') not in (None, ORIGIN):
            response = JSONResponse({'error': {'code': 'ORIGIN_REJECTED', 'message': 'Request origin is not allowed.'}}, status_code=403)
        elif request.method in ('POST', 'PATCH', 'PUT') and request.headers.get('content-type', '').split(';')[0] != 'application/json':
            response = JSONResponse({'error': {'code': 'CONTENT_TYPE', 'message': 'Use application/json.'}}, status_code=415)
        elif PRODUCTION and request.method in ('POST', 'PATCH', 'PUT', 'DELETE') and request.headers.get('origin') != ORIGIN:
            response = JSONResponse({'error': {'code': 'ORIGIN_REQUIRED', 'message': 'Request origin is required.'}}, status_code=403)
        else:
            response = await call_next(request)
    except Exception:
        logger.exception(json.dumps({'event': 'unexpected_error', 'request_id': request_id}))
        response = JSONResponse({'error': {'code': 'INTERNAL_ERROR', 'message': 'Something went wrong. Please try again.'}}, status_code=500)
    response.headers.update({'X-Request-ID': request_id, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store'})
    if PRODUCTION:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    logger.info(json.dumps({'request_id': request_id, 'method': request.method, 'status': response.status_code, 'duration_ms': round((time.monotonic() - start) * 1000)}))
    return response

@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse({'error': {'code': str(exc.status_code), 'message': str(exc.detail)}}, status_code=exc.status_code, headers=exc.headers)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    fields = {'.'.join(str(v) for v in e['loc'][1:]): e['msg'] for e in exc.errors()}
    return JSONResponse({'error': {'code': 'VALIDATION_ERROR', 'message': 'Please check the highlighted fields.', 'fields': fields}}, status_code=422)

@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    return JSONResponse({'error': {'code': 'SERVICE_UNAVAILABLE', 'message': 'Your data is temporarily unavailable. Please retry.'}}, status_code=503)

def auth(request: Request, session: Session = Depends(db)):
    token = request.cookies.get('track_session', '')
    current = session.get(LoginSession, digest(token)) if token else None
    now = int(time.time())
    if current is None or now - current.touched > 1800 or now - current.created > 604800:
        if current:
            session.delete(current)
            session.commit()
        raise HTTPException(401, 'Please sign in to continue.')
    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and not secrets.compare_digest(request.headers.get('X-CSRF-Token', ''), current.csrf):
        raise HTTPException(403, 'Your security token expired. Reload and try again.')
    throttle(session, 'api:' + current.user_id, 120, 60)
    current.touched = now
    session.commit()
    request.state.login_session = current
    return session.get(User, current.user_id)

def audit(session, user_id, action):
    session.add(AuditEvent(user_id=user_id, action=action))

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class LoginInput(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class RegisterInput(LoginInput):
    name: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=10, max_length=128)
    @field_validator('name')
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Enter your name.')
        return value

class MoneyInput(StrictModel):
    amount: Decimal = Field(gt=0, le=Decimal('9999999999.99'), max_digits=12, decimal_places=2)
    @field_validator('amount', mode='before')
    @classmethod
    def money_string(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r'\d{1,10}(\.\d{1,2})?', value):
            raise ValueError('Enter a positive amount with up to two decimal places.')
        return Decimal(value)

class TransactionInput(MoneyInput):
    category_id: str = Field(max_length=36)
    type: Literal['INCOME', 'EXPENSE']
    description: str = Field(default='', max_length=200)
    transaction_date: date
    @field_validator('transaction_date')
    @classmethod
    def date_range(cls, value):
        if not date(2000, 1, 1) <= value <= date(2100, 12, 31):
            raise ValueError('Date must be between 2000 and 2100.')
        return value

class BudgetInput(MoneyInput):
    category_id: str = Field(default='', max_length=36)
    month: str
    @field_validator('month')
    @classmethod
    def valid_month(cls, value):
        month_bounds(value)
        return value

def month_bounds(month):
    if not re.fullmatch(r'(20\d{2}|2100)-(0[1-9]|1[0-2])', month):
        raise HTTPException(422, 'Choose a valid month between 2000 and 2100.')
    year, number = map(int, month.split('-'))
    return f'{month}-01', f'{year + (number == 12):04d}-{1 if number == 12 else number + 1:02d}-01'

def profile(user, current):
    return {'id': user.id, 'name': user.name, 'email': user.email, 'csrf': current.csrf}

def new_session(session, user, response, old_token=''):
    if old_token:
        session.execute(delete(LoginSession).where(LoginSession.token_hash == digest(old_token)))
    token = secrets.token_urlsafe(48)
    current = LoginSession(token_hash=digest(token), user_id=user.id, csrf=secrets.token_urlsafe(32), created=int(time.time()), touched=int(time.time()))
    session.add(current)
    session.commit()
    response.set_cookie('track_session', token, httponly=True, secure=PRODUCTION, samesite='lax', max_age=604800, path='/')
    return profile(user, current)

# Register provider routes after the shared authentication helpers are defined.
from backend.google_auth import install_google_auth
install_google_auth(app)

@app.post('/api/v1/auth/register', status_code=201)
def register(data: RegisterInput, request: Request, response: Response, session: Session = Depends(db)):
    throttle(session, 'register:' + request.client.host, 5, 3600)
    email = str(data.email).lower()
    if session.scalar(select(User).where(User.email == email)):
        raise HTTPException(400, 'Unable to create this account. Try signing in or contact support.')
    user = User(email=email, name=data.name, password_hash=hasher.hash(data.password))
    session.add(user)
    session.flush()
    for name, kind in DEFAULTS:
        session.add(Category(user_id=user.id, name=name, type=kind))
    audit(session, user.id, 'account_created')
    return new_session(session, user, response, request.cookies.get('track_session', ''))

@app.post('/api/v1/auth/login')
def login(data: LoginInput, request: Request, response: Response, session: Session = Depends(db)):
    email = str(data.email).lower()
    throttle(session, 'login-ip:' + request.client.host, 15, 900)
    throttle(session, 'login-account:' + email, 5, 900)
    user = session.scalar(select(User).where(User.email == email))
    try:
        hasher.verify(user.password_hash if user else DUMMY_HASH, data.password)
    except (VerificationError, InvalidHashError):
        audit(session, user.id if user else None, 'login_failed')
        session.commit()
        raise HTTPException(401, 'Email or password is incorrect.')
    if not user:
        raise HTTPException(401, 'Email or password is incorrect.')
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(data.password)
    audit(session, user.id, 'login_success')
    return new_session(session, user, response, request.cookies.get('track_session', ''))

@app.get('/api/v1/auth/me')
def me(request: Request, user=Depends(auth)):
    return profile(user, request.state.login_session)

@app.post('/api/v1/auth/logout', status_code=204)
def logout(request: Request, response: Response, user=Depends(auth), session: Session = Depends(db)):
    session.delete(request.state.login_session)
    audit(session, user.id, 'logout')
    session.commit()
    response.delete_cookie('track_session', path='/')

class ResetInput(StrictModel):
    token: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=10, max_length=128)

@app.post('/api/v1/auth/reset')
def reset(data: ResetInput, request: Request, session: Session = Depends(db)):
    throttle(session, 'reset:' + request.client.host, 5, 3600)
    recovery = session.get(RecoveryToken, digest(data.token))
    if not recovery or recovery.expires < int(time.time()):
        raise HTTPException(400, 'Recovery token is invalid or expired.')
    user = session.get(User, recovery.user_id)
    user.password_hash = hasher.hash(data.password)
    session.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    session.execute(delete(RecoveryToken).where(RecoveryToken.user_id == user.id))
    audit(session, user.id, 'password_reset')
    session.commit()
    return {'message': 'Password updated. Sign in with your new password.'}

@app.get('/api/v1/categories')
def categories(user=Depends(auth), session: Session = Depends(db)):
    return [{'id': c.id, 'name': c.name, 'type': c.type} for c in session.scalars(select(Category).where(Category.user_id == user.id).order_by(Category.name))]

def tx_json(t):
    return {'id': t.id, 'category_id': t.category_id, 'type': t.type, 'amount': str(t.amount), 'description': t.description, 'transaction_date': t.transaction_date}

def transactions_query(user, month, category_id='', kind='', search=''):
    start, end = month_bounds(month)
    query = select(Transaction).where(Transaction.user_id == user.id, Transaction.transaction_date >= start, Transaction.transaction_date < end)
    if category_id:
        query = query.where(Transaction.category_id == category_id)
    if kind:
        if kind not in ('INCOME', 'EXPENSE'):
            raise HTTPException(422, 'Invalid transaction type.')
        query = query.where(Transaction.type == kind)
    if len(search) > 100:
        raise HTTPException(422, 'Search is too long.')
    if search:
        query = query.where(Transaction.description.contains(search, autoescape=True))
    return query.order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc(), Transaction.id)

@app.get('/api/v1/transactions')
def list_transactions(month: str, category_id: str = '', type: str = '', search: str = '', page: int = 1, page_size: int = 20, user=Depends(auth), session: Session = Depends(db)):
    if not 1 <= page <= 100000 or not 1 <= page_size <= 100:
        raise HTTPException(422, 'Invalid pagination.')
    query = transactions_query(user, month, category_id, type, search)
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    return {'items': [tx_json(t) for t in session.scalars(query.offset((page - 1) * page_size).limit(page_size))], 'total': total, 'page': page}

def owned_transaction(session, user, id):
    record = session.scalar(select(Transaction).where(Transaction.id == id, Transaction.user_id == user.id))
    if not record:
        raise HTTPException(404, 'Transaction not found.')
    return record

def validate_category(session, user, id, kind):
    category = session.scalar(select(Category).where(Category.id == id, Category.user_id == user.id, Category.type == kind))
    if not category:
        raise HTTPException(422, 'Choose a category for this transaction type.')

@app.get('/api/v1/transactions/{id}')
def get_transaction(id: str, user=Depends(auth), session: Session = Depends(db)):
    return tx_json(owned_transaction(session, user, id))

@app.post('/api/v1/transactions', status_code=201)
def create_transaction(data: TransactionInput, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'write:' + user.id, 60, 60)
    validate_category(session, user, data.category_id, data.type)
    item = Transaction(user_id=user.id, **{**data.model_dump(), 'description': data.description.strip(), 'transaction_date': data.transaction_date.isoformat()})
    session.add(item)
    audit(session, user.id, 'transaction_created')
    session.commit()
    return tx_json(item)

@app.patch('/api/v1/transactions/{id}')
def edit_transaction(id: str, data: TransactionInput, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'write:' + user.id, 60, 60)
    item = owned_transaction(session, user, id)
    validate_category(session, user, data.category_id, data.type)
    for field, value in data.model_dump().items():
        setattr(item, field, value.isoformat() if field == 'transaction_date' else value.strip() if field == 'description' else value)
    audit(session, user.id, 'transaction_updated')
    session.commit()
    return tx_json(item)

@app.delete('/api/v1/transactions/{id}', status_code=204)
def remove_transaction(id: str, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'write:' + user.id, 60, 60)
    session.delete(owned_transaction(session, user, id))
    audit(session, user.id, 'transaction_deleted')
    session.commit()

@app.get('/api/v1/budgets')
def budgets(month: str, user=Depends(auth), session: Session = Depends(db)):
    month_bounds(month)
    return [{'id': b.id, 'category_id': b.category_id, 'amount': str(b.amount), 'month': b.month} for b in session.scalars(select(Budget).where(Budget.user_id == user.id, Budget.month == month))]

@app.post('/api/v1/budgets')
def save_budget(data: BudgetInput, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'write:' + user.id, 60, 60)
    if data.category_id:
        validate_category(session, user, data.category_id, 'EXPENSE')
    item = session.scalar(select(Budget).where(Budget.user_id == user.id, Budget.category_id == data.category_id, Budget.month == data.month))
    if item:
        item.amount = data.amount
    else:
        item = Budget(user_id=user.id, **data.model_dump())
        session.add(item)
    audit(session, user.id, 'budget_saved')
    session.commit()
    return {'id': item.id, 'category_id': item.category_id, 'amount': str(item.amount), 'month': item.month}

@app.delete('/api/v1/budgets/{id}', status_code=204)
def remove_budget(id: str, user=Depends(auth), session: Session = Depends(db)):
    item = session.scalar(select(Budget).where(Budget.id == id, Budget.user_id == user.id))
    if not item:
        raise HTTPException(404, 'Budget not found.')
    session.delete(item)
    audit(session, user.id, 'budget_deleted')
    session.commit()

def totals(session, user, month):
    start, end = month_bounds(month)
    rows = session.scalars(select(Transaction).where(Transaction.user_id == user.id, Transaction.transaction_date >= start, Transaction.transaction_date < end)).all()
    income = sum((t.amount for t in rows if t.type == 'INCOME'), Decimal('0.00'))
    expense = sum((t.amount for t in rows if t.type == 'EXPENSE'), Decimal('0.00'))
    return rows, income, expense

@app.get('/api/v1/reports/monthly')
def monthly(month: str, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'report:' + user.id, 30, 60)
    rows, income, expense = totals(session, user, month)
    by_day = {}
    for t in rows:
        key = t.transaction_date
        day = by_day.setdefault(key, {'date': key, 'income': Decimal('0.00'), 'expense': Decimal('0.00')})
        day['income' if t.type == 'INCOME' else 'expense'] += t.amount
    selected = date.fromisoformat(month + '-01')
    trends = []
    for offset in range(5, -1, -1):
        index = selected.year * 12 + selected.month - 1 - offset
        current = f'{index // 12:04d}-{index % 12 + 1:02d}'
        _, inc, exp = totals(session, user, current)
        trends.append({'month': current, 'income': str(inc), 'expense': str(exp)})
    previous = trends[-2]
    return {'income': str(income), 'expense': str(expense), 'balance': str(income - expense), 'count': len(rows), 'days': [{k: str(v) for k, v in d.items()} for d in sorted(by_day.values(), key=lambda d: d['date'])], 'trends': trends, 'previous': previous}

@app.get('/api/v1/reports/categories')
def category_report(month: str, user=Depends(auth), session: Session = Depends(db)):
    rows, _, _ = totals(session, user, month)
    amounts = {}
    for t in rows:
        if t.type == 'EXPENSE':
            amounts[t.category_id] = amounts.get(t.category_id, Decimal('0.00')) + t.amount
    return [{'category_id': key, 'amount': str(value)} for key, value in amounts.items()]

@app.get('/api/v1/reports/export')
def export(month: str, user=Depends(auth), session: Session = Depends(db)):
    throttle(session, 'report:' + user.id, 30, 60)
    rows = session.scalars(transactions_query(user, month)).all()
    names = {c.id: c.name for c in session.scalars(select(Category).where(Category.user_id == user.id))}
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(['Date', 'Type', 'Category', 'Description', 'Amount (PHP)'])
    for t in rows:
        # Prefix dangerous spreadsheet formula cells when exporting user text.
        description = "'" + t.description if t.description.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else t.description
        writer.writerow([t.transaction_date, t.type, names[t.category_id], description, str(t.amount)])
    audit(session, user.id, 'report_exported')
    session.commit()
    return Response('\ufeff' + buffer.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="track-expense-{month}.csv"'})

@app.get('/api/v1/health/live')
def live():
    return {'status': 'ok'}

@app.get('/api/v1/health/ready')
def ready(session: Session = Depends(db)):
    session.execute(text('SELECT 1'))
    session.execute(select(User.id).limit(1))
    return {'status': 'ready'}

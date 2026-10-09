"""Initial Track Expense schema; frozen independently of application models."""
from alembic import op
import sqlalchemy as sa
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('users', sa.Column('id', sa.String(36), primary_key=True), sa.Column('email', sa.String(254), nullable=False, unique=True), sa.Column('name', sa.String(60), nullable=False), sa.Column('password_hash', sa.String(255), nullable=False))
    op.create_table('categories', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('name', sa.String(60), nullable=False), sa.Column('type', sa.String(7), nullable=False), sa.UniqueConstraint('user_id', 'name'), sa.CheckConstraint("type IN ('INCOME','EXPENSE')"))
    op.create_index('ix_categories_user_id', 'categories', ['user_id'])
    op.create_table('sessions', sa.Column('token_hash', sa.String(64), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('csrf', sa.String(64), nullable=False), sa.Column('created', sa.Integer, nullable=False), sa.Column('touched', sa.Integer, nullable=False))
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])
    op.create_table('transactions', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('category_id', sa.String(36), sa.ForeignKey('categories.id'), nullable=False), sa.Column('type', sa.String(7), nullable=False), sa.Column('amount', sa.Numeric(12, 2), nullable=False), sa.Column('description', sa.String(200), nullable=False), sa.Column('transaction_date', sa.String(10), nullable=False), sa.Column('created_at', sa.String(40), nullable=False), sa.CheckConstraint('amount > 0 AND amount <= 9999999999.99'), sa.CheckConstraint("type IN ('INCOME','EXPENSE')"))
    op.create_index('ix_tx_user_date', 'transactions', ['user_id', 'transaction_date'])
    op.create_table('budgets', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('category_id', sa.String(36), nullable=False), sa.Column('amount', sa.Numeric(12, 2), nullable=False), sa.Column('month', sa.String(7), nullable=False), sa.UniqueConstraint('user_id', 'category_id', 'month'), sa.CheckConstraint('amount > 0 AND amount <= 9999999999.99'))
    op.create_table('rate_buckets', sa.Column('key', sa.String(64), primary_key=True), sa.Column('hits', sa.Integer, nullable=False), sa.Column('expires', sa.Integer, nullable=False))
    op.create_table('recovery_tokens', sa.Column('token_hash', sa.String(64), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.Column('expires', sa.Integer, nullable=False))
    op.create_table('audit_events', sa.Column('id', sa.String(36), primary_key=True), sa.Column('user_id', sa.String(36), nullable=True), sa.Column('action', sa.String(50), nullable=False), sa.Column('created_at', sa.String(40), nullable=False))

def downgrade():
    for table in ['audit_events', 'recovery_tokens', 'rate_buckets', 'budgets', 'transactions', 'sessions', 'categories', 'users']:
        op.drop_table(table)

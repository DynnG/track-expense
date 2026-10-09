"""Google identities and short-lived browser-bound OAuth attempts."""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('google_identities', sa.Column('subject', sa.String(255), primary_key=True), sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False), sa.UniqueConstraint('user_id'))
    op.create_table('oauth_attempts', sa.Column('state_hash', sa.String(64), primary_key=True), sa.Column('browser_hash', sa.String(64), nullable=False), sa.Column('nonce', sa.String(64), nullable=False), sa.Column('verifier', sa.String(128), nullable=False), sa.Column('expires', sa.Integer(), nullable=False), sa.Column('link_session', sa.String(64), nullable=False))

def downgrade():
    op.drop_table('oauth_attempts')
    op.drop_table('google_identities')

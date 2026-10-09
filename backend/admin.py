"""Restricted operator commands. Never expose this module through HTTP."""
import argparse
import getpass
import secrets
import time
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from backend.app import engine, User, RecoveryToken, RateBucket, LoginSession, AuditEvent, digest
from backend.google_auth import OAuthAttempt

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['recovery-token', 'cleanup'])
args = parser.parse_args()
with Session(engine) as db:
    if args.command == 'recovery-token':
        email = input('Verified account email: ').strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if not user:
            raise SystemExit('Account not found.')
        # Operators must verify account ownership outside this tool.
        token = secrets.token_urlsafe(40)
        db.execute(delete(RecoveryToken).where(RecoveryToken.user_id == user.id))
        db.add(RecoveryToken(token_hash=digest(token), user_id=user.id, expires=int(time.time()) + 900))
        db.add(AuditEvent(user_id=user.id, action='operator_recovery_issued'))
        db.commit()
        print('Single-use token, expires in 15 minutes. Deliver privately to the verified owner:')
        print(token)
    else:
        now = int(time.time())
        db.execute(delete(OAuthAttempt).where(OAuthAttempt.expires < now))
        db.execute(delete(RateBucket).where(RateBucket.expires < now))
        db.execute(delete(RecoveryToken).where(RecoveryToken.expires < now))
        db.execute(delete(LoginSession).where((LoginSession.touched < now - 1800) | (LoginSession.created < now - 604800)))
        db.commit()
        print('Expired sessions, recovery tokens and rate counters cleaned.')

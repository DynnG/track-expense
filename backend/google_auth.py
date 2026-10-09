"""Google OIDC: server-side code exchange, browser-bound single-use state and PKCE."""
import base64
import hashlib
import os
import secrets
import time
from types import SimpleNamespace
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import TypeAdapter, EmailStr
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column
from backend.app import Base, User, Category, LoginSession, ORIGIN, PRODUCTION, DEFAULTS, auth, db, digest, hasher, new_session, audit, throttle, uid

class GoogleIdentity(Base):
    __tablename__ = 'google_identities'
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), unique=True)

class OAuthAttempt(Base):
    __tablename__ = 'oauth_attempts'
    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    browser_hash: Mapped[str] = mapped_column(String(64))
    nonce: Mapped[str] = mapped_column(String(64))
    verifier: Mapped[str] = mapped_column(String(128))
    expires: Mapped[int] = mapped_column(Integer)
    link_session: Mapped[str] = mapped_column(String(64), default='')

CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
CALLBACK = ORIGIN + '/api/v1/auth/google/callback'
COOKIE = 'track_google_flow'
JWKS = jwt.PyJWKClient('https://www.googleapis.com/oauth2/v3/certs', timeout=10, lifespan=300)

def enabled():
    return bool(CLIENT_ID and CLIENT_SECRET)

def finish(error='', linked=False):
    query = '?' + urlencode({'auth_error': error}) if error else ('?google_linked=1' if linked else '')
    response = RedirectResponse(ORIGIN + '/' + query + ('#settings' if linked else '#dashboard'), status_code=303)
    response.delete_cookie(COOKIE, path='/api/v1/auth/google')
    return response

def start(request, session, link_session=''):
    if not enabled():
        raise HTTPException(503, 'Google sign-in is not configured yet.')
    throttle(session, 'google-start:' + request.client.host, 15, 900)
    state, browser, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(4))
    session.add(OAuthAttempt(state_hash=digest(state), browser_hash=digest(browser), nonce=nonce, verifier=verifier, expires=int(time.time()) + 600, link_session=link_session))
    session.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({'client_id': CLIENT_ID, 'redirect_uri': CALLBACK, 'response_type': 'code', 'scope': 'openid email profile', 'state': state, 'nonce': nonce, 'code_challenge': challenge, 'code_challenge_method': 'S256', 'prompt': 'select_account'})
    response = RedirectResponse(url, status_code=303)
    response.set_cookie(COOKIE, browser, httponly=True, secure=PRODUCTION, samesite='lax', max_age=600, path='/api/v1/auth/google')
    return response

def exchange(code, verifier):
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        response = client.post('https://oauth2.googleapis.com/token', data={'code': code, 'client_id': CLIENT_ID, 'client_secret': CLIENT_SECRET, 'redirect_uri': CALLBACK, 'grant_type': 'authorization_code', 'code_verifier': verifier})
        response.raise_for_status()
        return response.json()['id_token']

def verify(token, nonce):
    key = JWKS.get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, key, algorithms=['RS256'], audience=CLIENT_ID, issuer=['https://accounts.google.com', 'accounts.google.com'], options={'require': ['exp', 'iat', 'iss', 'aud', 'sub', 'nonce']})
    if not secrets.compare_digest(str(claims['nonce']), nonce) or claims.get('email_verified') is not True:
        raise ValueError('Invalid identity')
    if (isinstance(claims['aud'], list) and len(claims['aud']) > 1 and claims.get('azp') != CLIENT_ID) or claims.get('azp', CLIENT_ID) != CLIENT_ID or not isinstance(claims['sub'], str) or not 1 <= len(claims['sub']) <= 255:
        raise ValueError('Invalid identity')
    claims['email'] = str(TypeAdapter(EmailStr).validate_python(claims.get('email', ''))).lower()
    return claims

def install_google_auth(app):
    @app.get('/api/v1/auth/providers')
    def providers():
        return {'google': enabled()}

    @app.get('/api/v1/auth/google/status')
    def status(user=Depends(auth), session: Session=Depends(db)):
        return {'enabled': enabled(), 'connected': bool(session.scalar(select(GoogleIdentity).where(GoogleIdentity.user_id == user.id)))}

    @app.get('/api/v1/auth/google/start')
    def begin(request: Request, session: Session=Depends(db)):
        return start(request, session)

    @app.post('/api/v1/auth/google/link')
    def link(request: Request, user=Depends(auth), session: Session=Depends(db)):
        current = request.state.login_session
        if int(time.time()) - current.created > 600:
            raise HTTPException(403, 'Sign out and sign in again before connecting Google.')
        response = start(request, session, current.token_hash)
        # Fetch should not follow a cross-origin redirect. Navigation follows this URL instead.
        from fastapi.responses import JSONResponse
        result = JSONResponse({'url': response.headers['location']})
        result.headers.append('set-cookie', response.headers['set-cookie'])
        return result

    @app.get('/api/v1/auth/google/callback')
    def callback(request: Request, session: Session=Depends(db)):
        state = request.query_params.get('state', '')
        browser = request.cookies.get(COOKIE, '')
        if not enabled() or not state or len(state) > 128 or not browser:
            return finish('invalid_flow')
        # Atomic consume prevents concurrent callback replay across API workers.
        row = session.execute(delete(OAuthAttempt).where(OAuthAttempt.state_hash == digest(state), OAuthAttempt.browser_hash == digest(browser)).returning(OAuthAttempt.expires, OAuthAttempt.nonce, OAuthAttempt.verifier, OAuthAttempt.link_session)).mappings().one_or_none()
        attempt = SimpleNamespace(**row) if row else None
        session.commit()
        if not attempt or attempt.expires < int(time.time()):
            return finish('invalid_flow')
        if request.query_params.get('error'):
            return finish('cancelled')
        code = request.query_params.get('code', '')
        if not code or len(code) > 4096:
            return finish('invalid_flow')
        try:
            claims = verify(exchange(code, attempt.verifier), attempt.nonce)
        except Exception:
            # Never log authorization codes, provider tokens or provider error bodies.
            return finish('verification_failed')
        identity = session.get(GoogleIdentity, claims['sub'])
        if attempt.link_session:
            current = session.get(LoginSession, attempt.link_session)
            now = int(time.time())
            if not current or digest(request.cookies.get('track_session', '')) != attempt.link_session or now - current.created > 600 or now - current.touched > 1800:
                return finish('invalid_flow')
            user = session.get(User, current.user_id)
            if identity and identity.user_id != user.id:
                return finish('already_connected')
            if session.scalar(select(GoogleIdentity).where(GoogleIdentity.user_id == user.id)) and not identity:
                return finish('already_connected')
        elif identity:
            user = session.get(User, identity.user_id)
        else:
            if session.scalar(select(User).where(User.email == claims['email'])):
                return finish('account_exists')
            user = User(email=claims['email'], name=str(claims.get('name') or 'Google user').strip()[:60] or 'Google user', password_hash=hasher.hash(secrets.token_urlsafe(64)))
            session.add(user)
            session.flush()
            for name, kind in DEFAULTS:
                session.add(Category(user_id=user.id, name=name, type=kind))
        if not identity:
            session.add(GoogleIdentity(subject=claims['sub'], user_id=user.id))
        audit(session, user.id, 'google_connected' if attempt.link_session else 'google_login')
        response = finish(linked=bool(attempt.link_session))
        try:
            new_session(session, user, response, request.cookies.get('track_session', ''))
        except IntegrityError:
            session.rollback()
            return finish('account_exists')
        return response

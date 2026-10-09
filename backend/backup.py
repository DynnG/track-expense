"""Encrypted database backup/restore. Keep BACKUP_KEY in a separate secret store."""
import argparse
import base64
import os
import secrets
import sqlite3
import subprocess
from contextlib import closing
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy.engine import make_url

MAGIC = b'TRACKEXPENSE-BACKUP-v1\x00'

def key():
    try:
        value = base64.b64decode(os.environ['BACKUP_KEY'], validate=True)
        if len(value) != 32:
            raise ValueError()
        return value
    except (KeyError, ValueError):
        raise SystemExit('Set BACKUP_KEY to a base64-encoded 32-byte key from your secret store.')

def encrypt(data: bytes, secret: bytes):
    nonce = secrets.token_bytes(12)
    return MAGIC + nonce + AESGCM(secret).encrypt(nonce, data, MAGIC)

def decrypt(data: bytes, secret: bytes):
    if not data.startswith(MAGIC):
        raise ValueError('Unsupported backup format.')
    start = len(MAGIC)
    return AESGCM(secret).decrypt(data[start:start + 12], data[start + 12:], MAGIC)

def pg_environment(url):
    env = os.environ.copy()
    for field, name in [('host', 'PGHOST'), ('port', 'PGPORT'), ('username', 'PGUSER'), ('password', 'PGPASSWORD'), ('database', 'PGDATABASE')]:
        value = getattr(url, field)
        if value is not None:
            env[name] = str(value)
    env['PGSSLMODE'] = url.query.get('sslmode', 'require')
    return env

def snapshot(database_url: str):
    url = make_url(database_url)
    if url.drivername.startswith('sqlite'):
        path = Path(url.database).resolve()
        if not path.is_file():
            raise ValueError('Source database does not exist.')
        with closing(sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True)) as source, closing(sqlite3.connect(':memory:')) as target:
            source.backup(target)
            return b'SQLITE\x00' + target.serialize()
    # The connection string and password never appear in process arguments.
    result = subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-acl'], env=pg_environment(url), capture_output=True)
    if result.returncode:
        raise RuntimeError('PostgreSQL backup failed. Check operator access and pg_dump availability.')
    return b'POSTGRES\x00' + result.stdout

def restore_new_sqlite(data: bytes, path: Path):
    if not data.startswith(b'SQLITE\x00'):
        raise ValueError('This archive is not a SQLite backup.')
    # Exclusive creation prevents overwriting an existing database.
    with path.open('xb') as output:
        output.write(data[len(b'SQLITE\x00'):])
    with closing(sqlite3.connect(path)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Restored database failed its integrity check.')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['backup', 'restore-sqlite', 'restore-postgres'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('--target', type=Path, help='New SQLite staging file; must not exist.')
    parser.add_argument('--staging-database-url', help='New empty staging PostgreSQL database. Prefer RESTORE_DATABASE_URL.')
    args = parser.parse_args()
    secret = key()
    if args.command == 'backup':
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        data = encrypt(snapshot(os.getenv('DATABASE_URL', 'sqlite:///./track_expense.db')), secret)
        with args.archive.open('xb') as output:
            output.write(data)
        print('Encrypted backup created. Copy it to restricted storage separate from the database.')
        return
    data = decrypt(args.archive.read_bytes(), secret)
    if args.command == 'restore-sqlite':
        if not args.target:
            parser.error('--target is required.')
        restore_new_sqlite(data, args.target)
        print('Restored to a new staging database. Verify counts and report totals before promotion.')
    else:
        if not data.startswith(b'POSTGRES\x00'):
            raise SystemExit('This is not a PostgreSQL backup.')
        target = os.getenv('RESTORE_DATABASE_URL', args.staging_database_url or '')
        if not target or target == os.getenv('DATABASE_URL'):
            raise SystemExit('Use a distinct empty staging database, never the primary database.')
        from sqlalchemy import create_engine, text
        target_engine = create_engine(target)
        with target_engine.connect() as connection:
            if connection.scalar(text("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")):
                raise SystemExit('Refusing to restore into a nonempty database.')
        result = subprocess.run(['pg_restore', '--no-owner', '--no-acl', '--exit-on-error', '--dbname=' + make_url(target).database], input=data[len(b'POSTGRES\x00'):], env=pg_environment(make_url(target)), capture_output=True)
        target_engine.dispose()
        if result.returncode:
            raise SystemExit('Restore failed. Discard the staging database and investigate.')
        print('Restored to empty PostgreSQL staging. Verify counts, relationships and report totals.')

if __name__ == '__main__':
    main()

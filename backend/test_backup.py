import sqlite3
from cryptography.exceptions import InvalidTag
import pytest
from backend.backup import encrypt, decrypt, snapshot, restore_new_sqlite

def test_authenticated_encryption_and_restore(tmp_path):
    source = tmp_path / 'source.db'
    with sqlite3.connect(source) as db:
        db.execute('CREATE TABLE transactions (amount TEXT)')
        db.executemany('INSERT INTO transactions VALUES (?)', [('0.10',), ('0.20',)])
    db.close()
    secret = b'k' * 32
    data = snapshot('sqlite:///' + str(source).replace('\\', '/'))
    encrypted = encrypt(data, secret)
    assert b'0.10' not in encrypted
    assert decrypt(encrypted, secret) == data
    with pytest.raises(InvalidTag):
        decrypt(encrypted[:-1] + bytes([encrypted[-1] ^ 1]), secret)
    staging = tmp_path / 'staging.db'
    restore_new_sqlite(decrypt(encrypted, secret), staging)
    with sqlite3.connect(staging) as db:
        assert db.execute('SELECT amount FROM transactions').fetchall() == [('0.10',), ('0.20',)]
    db.close()
    with pytest.raises(FileExistsError):
        restore_new_sqlite(data, staging)

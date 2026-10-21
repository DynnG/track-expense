"""Disposable local benchmark: never reads the development/production database."""
import ast, gc, json, os, statistics, subprocess, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
Path('.tmp').mkdir(exist_ok=True)
temporary = tempfile.TemporaryDirectory(dir='.tmp')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(temporary.name) / 'benchmark.db').replace('\\', '/')
os.environ['APP_ENV'] = 'test'
from sqlalchemy import event, insert
from sqlalchemy.orm import Session
import backend.app as api

source = subprocess.check_output(['git', 'show', '955eadb:backend/app.py'], text=True)
tree = ast.parse(source)
definitions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('totals', 'monthly')]
for node in definitions:
    node.decorator_list = []
namespace = dict(vars(api))
exec(compile(ast.Module(body=definitions, type_ignores=[]), 'baseline', 'exec'), namespace)
baseline = namespace['monthly']
api.Base.metadata.create_all(api.engine)
with Session(api.engine) as db:
    user = api.User(id='benchmark-user', name='Benchmark', email='benchmark@example.com', password_hash='not-a-login')
    db.add(user)
    db.flush()
    db.add(api.Category(id='benchmark-food', user_id=user.id, name='Food', type='EXPENSE'))
    db.flush()
    db.execute(insert(api.Transaction), [{'id': str(i), 'user_id': user.id, 'category_id': 'benchmark-food', 'type': 'INCOME' if i % 7 == 0 else 'EXPENSE', 'amount': '12.34', 'description': 'Synthetic benchmark record', 'transaction_date': f'2026-{5 + i % 6:02d}-{1 + i % 28:02d}'} for i in range(12000)])
    db.commit()
    from types import SimpleNamespace
    user = SimpleNamespace(id='benchmark-user')
    result = {}
    for name, function in [('before', baseline), ('after', api.monthly)]:
        times = []
        queries = []
        def query_count(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith('SELECT') and 'FROM transactions' in statement:
                queries.append(statement)
        event.listen(api.engine, 'before_cursor_execute', query_count)
        try:
            for iteration in range(6):
                gc.collect()
                start = time.perf_counter()
                report = function('2026-10', user, db)
                times.append((time.perf_counter() - start) * 1000)
        finally:
            event.remove(api.engine, 'before_cursor_execute', query_count)
        result[name] = {'median_ms': round(statistics.median(times[1:]), 2), 'transaction_selects': len(queries) // 6, 'expense': report['expense'], 'count': report['count']}
    assert result['before']['expense'] == result['after']['expense']
    assert result['before']['count'] == result['after']['count']
    print(json.dumps(result, indent=2))
api.engine.dispose()
temporary.cleanup()

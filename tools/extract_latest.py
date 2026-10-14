import sqlite3, base64, struct, sys

db = sys.argv[1]
out = sys.argv[2]
marker = 'data:image/png;base64,'
con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
con.text_factory = lambda b: b.decode('latin-1')
cur = con.cursor()

def png_size(d):
    return struct.unpack('>II', d[16:24]) if len(d) > 24 and d[:8] == b'\x89PNG\r\n\x1a\n' else None

cur.execute('SELECT rowid, data FROM part ORDER BY rowid')
rows = cur.fetchall()
best = None
for rowid, v in rows:
    if not isinstance(v, str) or marker not in v:
        continue
    i = v.find(marker) + len(marker)
    q = v.find('"', i)
    if q < 0:
        q = len(v)
    b64 = v[i:q]
    try:
        data = base64.b64decode(b64.encode('latin-1', 'ignore'), validate=False)
    except Exception:
        continue
    sz = png_size(data)
    if sz:
        print('rowid', rowid, 'size', sz, 'bytes', len(data))
        best = data  # 循环到最后一个 = 最近一张

if best:
    with open(out, 'wb') as f:
        f.write(best)
    print('LATEST', out, len(best), png_size(best))
else:
    print('none')

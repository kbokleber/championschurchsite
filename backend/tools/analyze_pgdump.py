import gzip
import re

p = r"C:\Users\Home\Downloads\pg-dump-all-1777069391.gz"
s = gzip.open(p, "rt", encoding="utf-8", errors="replace").read()
print("total chars", len(s))
for m in re.finditer(r"\\connect (\S+)", s):
    print("connect", m.group(1), "at", m.start())
for m in re.finditer(r'Database "(\w+)" dump', s):
    print("db section", m.group(1), "at", m.start())

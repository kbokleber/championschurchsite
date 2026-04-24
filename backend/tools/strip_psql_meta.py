"""Remove psql-only backslash commands from extracted pg_dump SQL."""
import re
import sys

src = sys.argv[1]
dst = sys.argv[2]
with open(src, "r", encoding="utf-8", errors="replace") as f:
    text = f.read()
# Drop \restrict / \unrestrict (pg_dumpall security noise for psql)
lines = []
for line in text.splitlines(keepends=True):
    if line.lstrip().startswith("\\restrict") or line.lstrip().startswith("\\unrestrict"):
        continue
    lines.append(line)
out = "".join(lines)
with open(dst, "w", encoding="utf-8", newline="\n") as f:
    f.write(out)
print("Wrote", dst, "lines", len(lines))

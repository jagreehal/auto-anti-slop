---
'auto-anti-slop': patch
---

Setup's baseline handles more project layouts: filesystems without hard links, a baseline linked into a read-only directory, and configs in dependencies git tracks. It reads nested configs in parallel, and stops if a config is rewritten or a directory appears during the scan.

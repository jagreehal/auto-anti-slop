---
'auto-anti-slop': patch
---

Baseline scans see what a normal lint sees. JS plugins get the project as `context.cwd`, and setup checks your Oxlint version before it replaces a baseline. A replaced baseline keeps its hard links and ACLs. Setup tracks each file a config imports, reads or extends, and the hook tells you when it leaves the baseline as it is.

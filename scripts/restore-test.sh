#!/usr/bin/env bash
# Flyttat till ops/. Står kvar för crontab-raderna och vanan på servern.
exec "$(dirname "$0")/../ops/restore-test.sh" "$@"

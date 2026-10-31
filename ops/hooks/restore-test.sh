#!/usr/bin/env bash
# shellcheck disable=SC2154  # count och sql kommer från ops/restore-test.sh.
# Vad kopian innehöll. Läses in av ops/restore-test.sh.
echo "  företag:      $(count companies)"
echo "  anställda:    $(count employees)"
echo "  stämplingar:  $(count time_entries)"
echo "  senaste stämpling: $(sql 'SELECT max(clock_in_at) FROM time_entries')"

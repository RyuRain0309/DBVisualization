#!/usr/bin/env bash
# Builds the sample .ibd files from a throwaway MySQL 8.0 container (no port published).
#   public/samples/users.ibd.gz  sample for the viewer, also used by the parser tests. Gzipped:
#                                the 9MB file is mostly never-written pages, so it shrinks to ~300KB
#   tests/fixtures/zipped.ibd    ROW_FORMAT=COMPRESSED, to test that it is recognised
set -euo pipefail
cd "$(dirname "$0")/.."

name="ibd-sample-$$"
docker run -d --name "$name" -e MYSQL_ALLOW_EMPTY_PASSWORD=yes mysql:8.0 >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT

# The image's entrypoint first starts a temporary server without networking; wait for the real one.
until docker logs "$name" 2>&1 | grep -q 'ready for connections.*port: 3306'; do sleep 1; done

docker exec -i "$name" mysql -uroot < scripts/sample-ibd.sql
# A clean shutdown flushes every dirty page, so the copied files match what was written.
docker stop "$name" >/dev/null

mkdir -p public/samples tests/fixtures
docker cp "$name:/var/lib/mysql/sample/users.ibd" public/samples/users.ibd
docker cp "$name:/var/lib/mysql/sample/zipped.ibd" tests/fixtures/zipped.ibd
gzip -9 -f public/samples/users.ibd
ls -l public/samples/users.ibd.gz tests/fixtures/zipped.ibd

# The connection pooler an instance may run (operator-cli §6.4.5): PgBouncer from Alpine's own package, with the PostgreSQL client that
# `sv status` reads its pools with, over the socket inside the container. It holds no configuration: `sv apply` mounts pgbouncer.ini,
# pg_hba.conf and userlist.txt, which it writes on every deployment. Released with the toolkit as ghcr.io/sovereignfs/pgbouncer:X.Y.Z.
FROM alpine:3.22
# The package makes no account of its own for the pooler, so there is one: its name is the console user `sv status` connects as, by peer
# authentication over the socket, which is how the console is reached without a password.
RUN apk add --no-cache pgbouncer postgresql-client \
 && adduser -S -D -H -h /var/empty -s /sbin/nologin pgbouncer \
 && mkdir -p /var/run/pgbouncer \
 && chown pgbouncer /var/run/pgbouncer
USER pgbouncer
EXPOSE 6432
ENTRYPOINT ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]

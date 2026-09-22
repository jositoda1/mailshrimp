// services/accounts-service/src/database/mysql-pool.ts

import { createPool, type Pool } from "mysql2/promise";

/**
 * Defines the database values required to create the MySQL connection pool.
 *
 * I receive validated configuration instead of reading process.env here so
 * configuration parsing remains centralized in environment.ts and this
 * infrastructure module remains straightforward to test.
 */
export interface MySqlPoolConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

/**
 * Creates the shared MySQL connection pool used by the accounts service.
 *
 * I use a pool rather than opening a new database connection for every
 * operation because establishing connections repeatedly is expensive and
 * unnecessary. The pool reuses a bounded number of connections instead.
 *
 * SQL values must still be supplied through mysql2 parameter binding using
 * positional "?" placeholders. The pool configuration does not make string
 * interpolation safe.
 */
export function createMySqlPool(config: MySqlPoolConfig): Pool {
    return createPool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,

        /*
         * I let requests wait for an available pooled connection instead of
         * immediately failing whenever all active connections are in use.
         *
         * This setting does not itself impose a waiting timeout. queueLimit below
         * bounds how many requests may wait so database saturation cannot create an
         * unlimited in-memory queue.
         */
        waitForConnections: true,

        /*
         * I deliberately bound the number of simultaneous database connections.
         * An application process must not be allowed to create connections without
         * limit because that can exhaust MySQL before application-level traffic
         * controls have a chance to react.
         */
        connectionLimit: 10,

        /*
         * I also bound the waiting queue. An unlimited queue can turn database
         * saturation into unbounded application memory growth.
         */
        queueLimit: 100,

        /*
         * I keep named placeholders disabled so repository SQL uses the standard
         * mysql2 positional "?" binding consistently.
         */
        namedPlaceholders: false,

        /*
         * MailShrimp stores authentication timestamps using one UTC convention.
         *
         * DATETIME itself does not contain timezone information. Setting the
         * connection timezone explicitly prevents timestamp interpretation from
         * silently depending on the local timezone of a developer machine, CI
         * runner, or production server.
         */
        timezone: "Z",

        /*
         * I allow mysql2 to convert MySQL date/time values into JavaScript Date
         * objects. The explicit UTC connection timezone above makes that conversion
         * deterministic for the timestamps used by AuthSession.
         */
        dateStrings: false,
    });
}

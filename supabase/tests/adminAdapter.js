/**
 * A tiny stand-in for the service-role supabase-js client, backed by PGlite, so
 * server code (lib/game/sessions.server.js) runs against the real migrations.
 * Supports exactly what that code uses: rpc(fn, namedArgs) and
 * from(table).select(cols).eq(col, v).order(col, {ascending}).limit(n).maybeSingle().
 */
export function createAdminAdapter(db) {
  const asService = async (sql, params) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (await tx.query(sql, params)).rows;
    });

  return {
    async rpc(fn, args) {
      const names = Object.keys(args);
      const sql = `select * from public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")})`;
      const values = names.map((name) => {
        const value = args[name];
        return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
      });
      try {
        const rows = await asService(sql, values);
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error: { message: error.message } };
      }
    },
    from(table) {
      const query = { columns: "*", filters: [], order: null, limit: null };
      const builder = {
        select(columns) {
          query.columns = columns;
          return builder;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return builder;
        },
        order(column, { ascending = true } = {}) {
          query.order = `${column} ${ascending ? "asc" : "desc"}`;
          return builder;
        },
        limit(count) {
          query.limit = count;
          return builder;
        },
        /** Awaiting the builder returns every matching row (like supabase-js). */
        then(resolve, reject) {
          const where = query.filters.map(([column], i) => `${column} = $${i + 1}`).join(" and ");
          const sql = `select ${query.columns} from public.${table}${where ? ` where ${where}` : ""}${query.order ? ` order by ${query.order}` : ""}${query.limit ? ` limit ${query.limit}` : ""}`;
          return db
            .query(sql, query.filters.map(([, value]) => value))
            .then((r) => ({ data: r.rows, error: null }), (error) => ({ data: null, error: { message: error.message } }))
            .then(resolve, reject);
        },
        async upsert(rows, { onConflict }) {
          const list = [].concat(rows);
          if (!list.length) return { data: null, error: null };
          const columns = Object.keys(list[0]);
          const keys = onConflict.split(",");
          const values = list.flatMap((row) => columns.map((c) => row[c]));
          const tuples = list.map((_, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(", ")})`).join(", ");
          const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
          const sql = `insert into public.${table} (${columns.join(", ")}) values ${tuples} on conflict (${onConflict}) do update set ${updates}`;
          try {
            await db.transaction(async (tx) => {
              await tx.exec("set local role service_role");
              await tx.query(sql, values);
            });
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error.message } };
          }
        },
        async maybeSingle() {
          const where = query.filters.map(([column], i) => `${column} = $${i + 1}`).join(" and ");
          const sql = `select ${query.columns} from public.${table}${where ? ` where ${where}` : ""}${query.order ? ` order by ${query.order}` : ""} limit ${query.limit ?? 2}`;
          try {
            const rows = await db.query(sql, query.filters.map(([, value]) => value)).then((r) => r.rows);
            return { data: rows[0] ?? null, error: null };
          } catch (error) {
            return { data: null, error: { message: error.message } };
          }
        },
      };
      return builder;
    },
  };
}

import mysql from "mysql2/promise";

export const eventPool = mysql.createPool({
  host: process.env.EVENT_DB_HOST,
  user: process.env.EVENT_DB_USER,
  password: process.env.EVENT_DB_PASSWORD,
  database: process.env.EVENT_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

/** Execute a query and return the rows as a JSON string (for AI tool responses). */
export async function query(sql: string, params: unknown[]): Promise<string> {
  const [rows] = await eventPool.query(sql, params);
  return JSON.stringify(rows, null, 2);
}

/** Execute a query and return the raw rows array. */
export async function fetchAll(sql: string, params: unknown[]): Promise<any[]> {
  const [rows] = await eventPool.query(sql, params) as [any[], any];
  return rows;
}

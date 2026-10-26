import hana from "@sap/hana-client";
import type { Connection } from "@sap/hana-client";

export interface BiUser {
  USER_ID: string;
  USER_NAME: string;
  USER_EMAIL: string;
  EMP_FULLNAME: string;
  EMP_ID: number;
  REPORTINGTOID: string;
  DEPTCODE: number;
  DEPARTMENT: string;
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''");
}

function hanaConfig(schema: string) {
  return {
    serverNode: process.env.SERVER_NODE || process.env.SAP_HANA_SERVER || "",
    uid: process.env.SAP_HANA_USER || "",
    pwd: process.env.SAP_HANA_PASSWORD || "",
    currentSchema: schema,
    pooling: true,
    connectionLifetime: 1800,
  };
}

function withConnection<T>(schema: string, run: (conn: Connection) => Promise<T>): Promise<T> {
  const config = hanaConfig(schema);
  if (!config.serverNode || !config.uid || !config.pwd) {
    throw new Error("HANA is not configured");
  }
  const conn = hana.createConnection();
  return new Promise((resolve, reject) => {
    conn.connect(config, async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(await run(conn));
      } catch (error) {
        reject(error);
      } finally {
        conn.disconnect();
      }
    });
  });
}

function exec<T>(conn: Connection, sql: string): Promise<T> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, [], (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

/**
 * Validate Intranet menu / top-bar OTP link (uSrId + LoTp + co).
 * `companyCode` is the HANA schema / BRANCH from Intranet (e.g. BI_NEGT).
 */
export async function verifyIntranetLinkOtp(
  userId: string,
  otp: string,
  companyCode: string,
): Promise<BiUser | null> {
  const schema = String(companyCode || "").trim();
  if (!schema) return null;

  const safeUserId = escapeSql(String(userId).trim());
  const sql = `
    SELECT USER_ID, USER_NAME, USER_EMAIL, EMP_FULLNAME, EMP_ID, REPORTINGTOID, DEPTCODE, DEPARTMENT, PWDOTP
    FROM BI_USERMASTER
    WHERE USER_ACTIVE = 'Y'
      AND USERTYPE = 'U'
      AND EMP_ID != '0'
      AND USER_ID = '${safeUserId}'
  `;

  const rows = await withConnection<
    Array<BiUser & { PWDOTP?: string | number | null }>
  >(schema, (conn) => exec(conn, sql));

  const row = rows?.[0];
  if (!row) return null;

  const expectedOtp = String(row.PWDOTP ?? "").trim();
  const providedOtp = String(otp).trim();
  if (!expectedOtp || expectedOtp !== providedOtp) return null;

  return {
    USER_ID: row.USER_ID,
    USER_NAME: row.USER_NAME,
    USER_EMAIL: row.USER_EMAIL,
    EMP_FULLNAME: row.EMP_FULLNAME,
    EMP_ID: row.EMP_ID,
    REPORTINGTOID: row.REPORTINGTOID,
    DEPTCODE: row.DEPTCODE,
    DEPARTMENT: row.DEPARTMENT,
  };
}

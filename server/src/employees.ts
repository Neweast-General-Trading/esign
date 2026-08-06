import hana from "@sap/hana-client";
import type { Connection } from "@sap/hana-client";
import sql from "mssql";

export interface CompanyOption {
  code: string;
  name: string;
}

export const COMPANIES: CompanyOption[] = [
  { code: "BI_NEGT", name: "New East General Trading FZCO" },
  { code: "BI_NEGTLLC", name: "New East General Trading LLC" },
  { code: "BI_NESA", name: "New East Shipping Agency" },
  { code: "BI_NEGT_OMAN", name: "New East General Trading - OMAN" },
  { code: "BI_NEGT_KW", name: "New East General Trading - KUWAIT" },
  { code: "BI_NEGT_JPN", name: "New East General Trading - Japan" },
  { code: "BI_NEGT_BAHRAIN", name: "New East General Trading - Bahrain" },
  { code: "BI_NEGT_BAIC", name: "Juma Mohammed Ahli for Trucks Co [BAIC]" },
  { code: "BI_NEGT_AUTOLLC", name: "JUMA AHLI MOTORS FZCO (NEAUTOLLC)" },
  { code: "BI_NEGT_KSAISUZU", name: "Neweast KSA - ISUZU" },
  { code: "BI_NEGT_KSAPARTS", name: "Neweast KSA - PARTS" },
];

export interface Employee {
  id: string;
  empId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  departmentCode: number | null;
  companyCode: string;
  companyName: string;
}

export interface Department {
  code: number;
  name: string;
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

function withHanaSchema<T>(schema: string, run: (conn: Connection) => Promise<T>): Promise<T> {
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

function execHana<T>(conn: Connection, query: string): Promise<T> {
  return new Promise((resolve, reject) => {
    conn.exec(query, [], (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

let sqlPool: sql.ConnectionPool | null = null;
let designationCache: { loadedAt: number; map: Map<string, string> } | null = null;
let employeesCache: {
  loadedAt: number;
  employees: Employee[];
  departments: Department[];
  companies: CompanyOption[];
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

async function getSqlPool() {
  if (!process.env.SQL_DB_SERVER || !process.env.SQL_DB_DATABASE) {
    return null;
  }
  if (sqlPool?.connected) return sqlPool;
  const password = String(process.env.SQL_DB_PASSWORD ?? "").replace(/^"|"$/g, "");
  sqlPool = await new sql.ConnectionPool({
    user: process.env.SQL_DB_USER,
    password,
    server: process.env.SQL_DB_SERVER,
    database: process.env.SQL_DB_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }).connect();
  return sqlPool;
}

async function getPayrollDesignationMap() {
  if (designationCache && Date.now() - designationCache.loadedAt < CACHE_TTL_MS) {
    return designationCache.map;
  }

  const pool = await getSqlPool();
  if (!pool) return new Map<string, string>();

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(EmpId)) AS EmpId,
      LTRIM(RTRIM(DesignationName)) AS DesignationName
    FROM Payroll_Employee
    WHERE EmpActive = 'Y'
      AND DesignationName IS NOT NULL
      AND LTRIM(RTRIM(DesignationName)) <> ''
  `);

  const map = new Map<string, string>();
  for (const row of result.recordset ?? []) {
    const empId = String(row.EmpId ?? "").trim();
    const designation = String(row.DesignationName ?? "").trim();
    if (!empId || !designation) continue;
    if (!map.has(empId)) map.set(empId, designation);
  }

  designationCache = { loadedAt: Date.now(), map };
  return map;
}

type BiUserRow = {
  USER_ID: string;
  USER_NAME: string;
  EMP_FULLNAME?: string;
  USER_EMAIL: string;
  EMP_ID?: string | number;
  DEPTCODE?: number;
  DEPARTMENT?: string;
  DESIGNATION?: string | null;
};

function resolveDesignation(row: BiUserRow, map: Map<string, string>) {
  const fromBi = String(row.DESIGNATION ?? "").trim();
  if (fromBi) return fromBi;

  for (const key of [String(row.USER_ID ?? "").trim(), String(row.EMP_ID ?? "").trim()]) {
    if (!key || key === "0") continue;
    const found = map.get(key);
    if (found) return found;
  }
  return "";
}

async function loadEmployeesFromCompany(company: CompanyOption): Promise<Employee[]> {
  try {
    const rows = await withHanaSchema<BiUserRow[]>(company.code, (conn) =>
      execHana(
        conn,
        `
        SELECT USER_ID, USER_NAME, EMP_FULLNAME, USER_EMAIL, EMP_ID, DEPTCODE, DEPARTMENT, DESIGNATION
        FROM BI_USERMASTER
        WHERE USER_ACTIVE = 'Y'
          AND USERTYPE = 'U'
          AND EMP_ID != '0'
          AND USER_EMAIL IS NOT NULL
          AND TO_NVARCHAR(USER_EMAIL) <> ''
        ORDER BY EMP_FULLNAME, USER_NAME
      `,
      ),
    );

    return (rows ?? []).map((row) => {
      const email = String(row.USER_EMAIL ?? "").trim().toLowerCase();
      const name =
        String(row.EMP_FULLNAME ?? "").trim() ||
        String(row.USER_NAME ?? "").trim() ||
        email;
      const department = String(row.DEPARTMENT ?? "").trim();
      const departmentCode =
        row.DEPTCODE === undefined || row.DEPTCODE === null ? null : Number(row.DEPTCODE);

      return {
        id: `${company.code}:${String(row.USER_ID ?? email)}`,
        empId: String(row.EMP_ID ?? "").trim(),
        name,
        email,
        designation: String(row.DESIGNATION ?? "").trim(),
        department,
        departmentCode,
        companyCode: company.code,
        companyName: company.name,
      };
    }).filter((emp) => emp.email.includes("@"));
  } catch (error) {
    console.warn(
      `Failed loading employees for ${company.code}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function listEmployeesAndDepartments() {
  if (employeesCache && Date.now() - employeesCache.loadedAt < CACHE_TTL_MS) {
    return employeesCache;
  }

  const designationMap = await getPayrollDesignationMap();
  const perCompany = await Promise.all(COMPANIES.map((company) => loadEmployeesFromCompany(company)));

  const employees: Employee[] = [];
  const seenEmails = new Set<string>();
  const deptMap = new Map<number, string>();
  const companyCounts = new Map<string, number>();

  for (const rows of perCompany) {
    for (const emp of rows) {
      if (seenEmails.has(emp.email)) continue;
      seenEmails.add(emp.email);

      const designation =
        emp.designation ||
        resolveDesignation(
          {
            USER_ID: emp.id.split(":")[1] || emp.id,
            USER_NAME: emp.name,
            USER_EMAIL: emp.email,
            EMP_ID: emp.empId,
            DESIGNATION: emp.designation,
          },
          designationMap,
        );

      if (emp.departmentCode && emp.department) {
        deptMap.set(emp.departmentCode, emp.department);
      }
      companyCounts.set(emp.companyCode, (companyCounts.get(emp.companyCode) ?? 0) + 1);

      employees.push({
        ...emp,
        designation,
      });
    }
  }

  employees.sort((a, b) => a.name.localeCompare(b.name));

  const departments = [...deptMap.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const companies = COMPANIES.filter((company) => (companyCounts.get(company.code) ?? 0) > 0);

  employeesCache = { loadedAt: Date.now(), employees, departments, companies };
  return employeesCache;
}

export async function resolveEmployeesForSend(input: {
  mode: "all" | "selected" | "department" | "company";
  emails?: string[];
  departmentCodes?: number[];
  companyCodes?: string[];
}) {
  const { employees } = await listEmployeesAndDepartments();

  if (input.mode === "all") {
    return employees;
  }

  if (input.mode === "company") {
    const codes = new Set(
      (input.companyCodes ?? []).map((code) => code.trim()).filter(Boolean),
    );
    return employees.filter((emp) => codes.has(emp.companyCode));
  }

  if (input.mode === "department") {
    const codes = new Set((input.departmentCodes ?? []).map(Number));
    return employees.filter(
      (emp) => emp.departmentCode !== null && codes.has(emp.departmentCode),
    );
  }

  const emails = new Set(
    (input.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  return employees.filter((emp) => emails.has(emp.email.toLowerCase()));
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

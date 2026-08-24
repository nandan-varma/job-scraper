/**
 * One-time backfill for jobs.department_category and
 * jobs.employment_type_category on rows written before those columns
 * existed — pure local computation over data already in the DB (department/
 * employment_type text), no ATS API calls, no rate-limit exposure.
 *
 * Rather than one UPDATE per row, this groups the (much smaller) set of
 * DISTINCT department/employment_type strings by their computed category in
 * JS, then issues one UPDATE ... WHERE col IN (...) per category per chunk —
 * a few hundred statements covering hundreds of thousands of rows, not one
 * statement per row. Run with `tsx scripts/backfill-categories.ts`.
 */
import "./_env";

import { inArray, isNull, isNotNull, and, sql } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { jobs } from "../src/lib/db/schema";
import { categorizeDepartment } from "../src/lib/department-category";
import { categorizeEmploymentType } from "../src/lib/employment-type";

const CHUNK = 200;

async function groupByCategory(
  label: string,
  values: (string | null)[],
  categorize: (v: string) => string | null,
): Promise<Map<string, string[]>> {
  const byCategory = new Map<string, string[]>();
  let skipped = 0;
  for (const v of values) {
    if (v == null) continue;
    const cat = categorize(v);
    if (!cat) {
      skipped++;
      continue;
    }
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(v);
  }
  console.log(
    `${label}: ${values.length} distinct values, ${skipped} left uncategorized, ${byCategory.size} categories`,
  );
  return byCategory;
}

async function backfillDepartment() {
  const rows = await db
    .selectDistinct({ v: jobs.department })
    .from(jobs)
    .where(and(isNotNull(jobs.department), isNull(jobs.departmentCategory)));
  const byCategory = await groupByCategory(
    "department",
    rows.map((r) => r.v),
    (v) => categorizeDepartment(v),
  );

  let totalRows = 0;
  for (const [cat, vals] of byCategory) {
    for (let i = 0; i < vals.length; i += CHUNK) {
      const chunk = vals.slice(i, i + CHUNK);
      const result = await db
        .update(jobs)
        .set({ departmentCategory: cat as ReturnType<typeof categorizeDepartment> })
        .where(and(inArray(jobs.department, chunk), isNull(jobs.departmentCategory)))
        .returning({ id: jobs.id });
      totalRows += result.length;
    }
    console.log(`  department -> ${cat}: done`);
  }
  console.log(`department: backfilled ${totalRows} rows`);
}

async function backfillEmploymentType() {
  const rows = await db
    .selectDistinct({ v: jobs.employmentType })
    .from(jobs)
    .where(and(isNotNull(jobs.employmentType), isNull(jobs.employmentTypeCategory)));
  const byCategory = await groupByCategory(
    "employment_type",
    rows.map((r) => r.v),
    (v) => categorizeEmploymentType(v),
  );

  let totalRows = 0;
  for (const [cat, vals] of byCategory) {
    for (let i = 0; i < vals.length; i += CHUNK) {
      const chunk = vals.slice(i, i + CHUNK);
      const result = await db
        .update(jobs)
        .set({ employmentTypeCategory: cat as ReturnType<typeof categorizeEmploymentType> })
        .where(and(inArray(jobs.employmentType, chunk), isNull(jobs.employmentTypeCategory)))
        .returning({ id: jobs.id });
      totalRows += result.length;
    }
    console.log(`  employment_type -> ${cat}: done`);
  }
  console.log(`employment_type: backfilled ${totalRows} rows`);
}

async function main() {
  await backfillDepartment();
  await backfillEmploymentType();

  const [row] = await db
    .select({
      deptDone: sql<number>`count(*) filter (where ${jobs.departmentCategory} is not null)`,
      deptTotal: sql<number>`count(*) filter (where ${jobs.department} is not null)`,
      empDone: sql<number>`count(*) filter (where ${jobs.employmentTypeCategory} is not null)`,
      empTotal: sql<number>`count(*) filter (where ${jobs.employmentType} is not null)`,
    })
    .from(jobs);
  console.log(`department_category: ${row.deptDone}/${row.deptTotal}`);
  console.log(`employment_type_category: ${row.empDone}/${row.empTotal}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("backfill failed:", e);
  process.exit(1);
});

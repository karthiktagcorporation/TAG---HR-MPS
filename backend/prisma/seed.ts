/* eslint-disable no-console */
import {
  PrismaClient,
  RoleCode,
  MasterStatus,
  PlanStatus,
  NotificationType,
  NotificationSeverity,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Demo plans/actuals are only created when SEED_SAMPLE_DATA=true is set explicitly.
const SEED_SAMPLE_DATA = (process.env.SEED_SAMPLE_DATA ?? 'false').toLowerCase() === 'true';

// ---------- master data ----------

const ROLES: { code: RoleCode; name: string; description: string }[] = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access to every module and setting.' },
  { code: 'HR_ADMIN', name: 'HR Admin', description: 'Manage manpower plans and daily actuals, approve plans, view reports.' },
  { code: 'MANAGEMENT', name: 'Management / Viewer', description: 'Read-only dashboards & reports.' },
  { code: 'USER_MASTER', name: 'User Master', description: 'Update daily actuals for assigned cost centers only.' },
];

const VENDORS = [
  'Uplifto Facilities',
  'Fine Care',
  'SRMVN',
  'B Group',
  'KKH Enterprises',
  'Ramya Enterprises',
  'V2J Enterprises',
  'Weldone Welders',
  'MAS HR Solution',
  'AS Enterprises',
  'MSM Enterprises',
  'KGT Enterprises',
  'Om Shakthi Enterprises',
  'Lakinath Doley',
  'Vivegananda Paswan',
  'Rampujan',
  'S Enterprises',
  'LNT Enterprises',
];

const UNITS = [
  { code: 'U1', name: 'Unit 1' },
  { code: 'U2', name: 'Unit 2' },
  { code: 'U3', name: 'Unit 3' },
  { code: 'U4', name: 'Unit 4' },
];

// div(unit) | costCode | costCentre
const COST_CENTERS: { unit: string; code: string; name: string }[] = [
  { unit: 'U1', code: 'ASSMB', name: 'ASSEMBLY SHOP' },
  { unit: 'U1', code: 'HCTST', name: 'CONDUCTOR TESTING' },
  { unit: 'U1', code: 'HHTST', name: 'HARDWARE TESTING' },
  { unit: 'U1', code: 'HRBMD', name: 'RUBBER MOULDING' },
  { unit: 'U2', code: 'RBATCH', name: 'RBATCH' },
  { unit: 'U2', code: 'ALFAB', name: 'ALUMINIUM FABRICATION' },
  { unit: 'U2', code: 'FRGSF', name: 'STEEL FABRICATION' },
  { unit: 'U2', code: 'HFRGN', name: 'FORGING SHOP' },
  { unit: 'U2', code: 'HMCSH', name: 'MACHINE SHOP' },
  { unit: 'U2', code: 'HRBMD', name: 'RUBBER MOULDING' },
  { unit: 'U2', code: 'HRODC', name: 'ROD CUTTING SHOP' },
  { unit: 'U2', code: 'MAINT', name: 'MAINTENANCE' },
  { unit: 'U2', code: 'NRHTT', name: 'NORMALISING & SHOT BLASTING' },
  { unit: 'U2', code: 'PLCUT', name: 'PLASMA CUTTING' },
  { unit: 'U2', code: 'QUALI', name: 'QUALITY' },
  { unit: 'U2', code: 'STWLG', name: 'STEEL WELDING' },
  { unit: 'U2', code: 'TTLRM', name: 'TOOL ROOM' },
  { unit: 'U3', code: 'HGLVG', name: 'GALVANISING' },
  { unit: 'U4', code: 'HRADM', name: 'HR & ADMIN' },
  { unit: 'U4', code: 'HAMRD', name: 'ARMOUR ROD' },
  { unit: 'U4', code: 'HGCSH', name: 'GAS/PLATE CUTTING SHOP' },
  { unit: 'U4', code: 'HVTDP', name: 'VIBRATION DAMPER' },
  { unit: 'U4', code: 'INSUL', name: 'INSULATOR PROJECT' },
  { unit: 'U4', code: 'STORE', name: 'STORE' },
];

const DEFAULT_SETTINGS: { key: string; value: unknown }[] = [
  {
    key: 'company_profile',
    value: {
      name: 'TAG Corporation',
      appName: 'TAG - MPS',
      logoUrl: '',
      address: '',
      email: 'hr@tagcorporation.net',
      phone: '',
    },
  },
  {
    key: 'thresholds',
    value: {
      attendanceWarningPercent: 90,
      attendanceCriticalPercent: 80,
      shortageWarning: 5,
      shortageCritical: 15,
    },
  },
  {
    key: 'report_defaults',
    value: { pageSize: 25, defaultExport: 'xlsx', dateFormat: 'DD-MM-YYYY' },
  },
  {
    key: 'theme',
    value: { default: 'light', allowUserToggle: true },
  },
  {
    key: 'financial_year',
    value: { startMonth: 4, label: 'Apr - Mar' },
  },
];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

async function main() {
  console.log('🌱 Seeding TAG - MPS database...');

  // ---- Roles ----
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: { code: r.code, name: r.name, description: r.description },
    });
  }
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  console.log(`✅ Roles seeded (${ROLES.length})`);

  // ---- Super Admin user ----
  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@tagcorporation.net';
  const adminUsername = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const adminName = process.env.SUPER_ADMIN_NAME ?? 'TAG Super Admin';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe@12345';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, username: adminUsername, roleId: superAdminRole.id, status: MasterStatus.ACTIVE },
    create: {
      name: adminName,
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      roleId: superAdminRole.id,
      status: MasterStatus.ACTIVE,
    },
  });
  console.log(`✅ Super Admin ready: ${adminEmail} / ${adminUsername}`);

  // ---- Vendors ----
  for (let i = 0; i < VENDORS.length; i++) {
    const code = `V${pad(i + 1)}`;
    await prisma.vendor.upsert({
      where: { vendorCode: code },
      update: { vendorName: VENDORS[i] },
      create: { vendorCode: code, vendorName: VENDORS[i], status: MasterStatus.ACTIVE },
    });
  }
  console.log(`✅ Vendors seeded (${VENDORS.length})`);

  // ---- Units ----
  for (const u of UNITS) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name },
      create: { code: u.code, name: u.name, status: MasterStatus.ACTIVE },
    });
  }
  console.log(`✅ Units seeded (${UNITS.length})`);

  // ---- Cost Centers ----
  const unitMap = new Map((await prisma.unit.findMany()).map((u) => [u.code, u.id]));

  for (const c of COST_CENTERS) {
    const unitId = unitMap.get(c.unit)!;
    // findFirst: unique key now includes department (seed rows have none)
    const existing = await prisma.costCenter.findFirst({
      where: { unitId, costCode: c.code },
    });
    if (existing) {
      await prisma.costCenter.update({ where: { id: existing.id }, data: { costCentre: c.name } });
    } else {
      await prisma.costCenter.create({
        data: { costCode: c.code, costCentre: c.name, unitId, status: MasterStatus.ACTIVE },
      });
    }
  }
  console.log(`✅ Cost centers seeded (${COST_CENTERS.length})`);

  // ---- Settings ----
  for (const s of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as object },
      create: { key: s.key, value: s.value as object },
    });
  }
  console.log(`✅ Settings seeded (${DEFAULT_SETTINGS.length})`);

  if (!SEED_SAMPLE_DATA) {
    console.log('ℹ️  SEED_SAMPLE_DATA=false → skipping demo plans/actuals.');
    console.log('🎉 Seed complete (clean dataset).');
    return;
  }

  await seedSampleData();
  console.log('🎉 Seed complete (with sample data).');
}

async function seedSampleData() {
  const admin = await prisma.user.findFirstOrThrow({ where: { username: process.env.SUPER_ADMIN_USERNAME ?? 'superadmin' } });
  const costCenters = await prisma.costCenter.findMany({ include: { unit: true } });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Approved monthly plan (one row per cost center) for the current month.
  const planned: { costCenterId: string; unitId: string; count: number }[] = [];
  let i = 0;
  for (const cc of costCenters.slice(0, 20)) {
    i++;
    const count = 15 + ((i * 7) % 40);
    const plan = await prisma.manpowerPlan.upsert({
      where: { plan_unique_key: { year, month, costCenterId: cc.id } },
      update: { plannedCount: count, status: PlanStatus.APPROVED, approvedById: admin.id, approvedAt: new Date() },
      create: {
        year,
        month,
        unitId: cc.unitId,
        costCenterId: cc.id,
        plannedCount: count,
        status: PlanStatus.APPROVED,
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    await prisma.planStatusHistory.create({
      data: { planId: plan.id, fromStatus: PlanStatus.PENDING, toStatus: PlanStatus.APPROVED, actionById: admin.id, remarks: 'Auto-approved (seed)' },
    });
    planned.push({ costCenterId: cc.id, unitId: cc.unitId, count });
  }

  // A few pending plans to populate the approval queue.
  for (const cc of costCenters.slice(20, 23)) {
    await prisma.manpowerPlan.upsert({
      where: { plan_unique_key: { year, month, costCenterId: cc.id } },
      update: { status: PlanStatus.PENDING },
      create: { year, month, unitId: cc.unitId, costCenterId: cc.id, plannedCount: 18, status: PlanStatus.PENDING, createdById: admin.id },
    });
  }

  // Daily actuals for the last 10 days against the approved plans.
  for (let d = 9; d >= 0; d--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d));
    for (const p of planned) {
      const swing = ((d + p.count) % 7) - 3; // -3..+3
      const actualCount = Math.max(0, p.count + swing);
      const shortage = Math.max(p.count - actualCount, 0);
      const excess = Math.max(actualCount - p.count, 0);
      await prisma.manpowerActual.upsert({
        where: { actual_unique_key: { date, costCenterId: p.costCenterId } },
        update: { actualCount, shortage, excess },
        create: { date, unitId: p.unitId, costCenterId: p.costCenterId, actualCount, shortage, excess, createdById: admin.id },
      });
    }
  }
  console.log('✅ Sample plans, approvals and 10 days of actuals seeded');

  // Notifications
  await prisma.notification.createMany({
    data: [
      { title: 'Critical shortage detected', message: 'Forging Shop (SV) reported a critical shortage today.', type: NotificationType.CRITICAL_SHORTAGE, severity: NotificationSeverity.CRITICAL, roleCode: 'HR_ADMIN' },
      { title: 'Plans pending approval', message: '3 manpower plans are awaiting your approval.', type: NotificationType.PENDING_APPROVAL, severity: NotificationSeverity.WARNING, roleCode: 'HR_ADMIN' },
      { title: 'Welcome to TAG - MPS', message: 'Your manpower monitoring workspace is ready.', type: NotificationType.SYSTEM, severity: NotificationSeverity.INFO, userId: admin.id },
    ],
  });
  console.log('✅ Sample notifications seeded');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

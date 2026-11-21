import prisma from '../config/prisma';

async function main() {
  console.log('--- Starting Accounts Cleanup for Super Admin ---');

  // 1. Fetch all organizations
  const orgs = await prisma.organization.findMany();
  console.log(`Found ${orgs.length} organizations to remove:`, orgs.map(o => `${o.name} (${o.id})`));

  const orgIds = orgs.map(o => o.id);

  // 2. Delete dependent evaluation, activity, share, and batch records for all orgs
  console.log('Cleaning activities, evaluations, applications...');
  await prisma.candidateHiringActivity.deleteMany({
    where: { organizationId: { in: orgIds } }
  }).catch(e => console.log('activity note:', e.message));

  await prisma.evaluation.deleteMany({
    where: { organizationId: { in: orgIds } }
  }).catch(e => console.log('evaluation note:', e.message));

  await prisma.clientCandidateShareItem.deleteMany({}).catch(() => {});
  await prisma.clientCandidateShare.deleteMany({}).catch(() => {});

  await prisma.bulkCvItem.deleteMany({}).catch(() => {});
  await prisma.bulkUploadBatch.deleteMany({}).catch(() => {});

  await prisma.candidateApplication.deleteMany({}).catch(() => {});

  // 3. Delete candidates
  const deletedCandidates = await prisma.candidate.deleteMany({
    where: { organizationId: { in: orgIds } }
  }).catch(() => ({ count: 0 }));
  console.log(`Deleted ${deletedCandidates.count} candidates.`);

  // 4. Delete jobs
  const deletedJobs = await prisma.job.deleteMany({
    where: { organizationId: { in: orgIds } }
  }).catch(() => ({ count: 0 }));
  console.log(`Deleted ${deletedJobs.count} jobs.`);

  // 5. Delete audit logs
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: orgIds } }
  }).catch(() => {});

  // 6. Delete all non-super-admin users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      role: { not: 'SUPER_ADMIN' },
      email: { notIn: ['operations@tasknera.com', 'demo@gmail.com', 'admin@gmail.com'] }
    }
  });
  console.log(`Deleted ${deletedUsers.count} client accounts/users.`);

  // 7. Update super admin users to detach from any deleted org
  await prisma.user.updateMany({
    where: { role: 'SUPER_ADMIN' },
    data: { organizationId: null }
  });
  console.log('Detached super admin accounts from organizations.');

  // 8. Delete all organizations
  const deletedOrgs = await prisma.organization.deleteMany({
    where: { id: { in: orgIds } }
  });
  console.log(`Deleted ${deletedOrgs.count} organizations from Super Admin.`);

  // 9. Verify state
  const remainingOrgs = await prisma.organization.count();
  const remainingUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, organizationId: true }
  });

  console.log('--- CLEANUP COMPLETE ---');
  console.log('Remaining Organizations in Super Admin:', remainingOrgs);
  console.log('Remaining Users in Database:', remainingUsers);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});

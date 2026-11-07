import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';

async function main() {
  const email = 'demo@gmail.com';
  const plainPassword = 'demo@1234';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const existing = await prisma.user.findFirst({
    where: { email }
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: 'Demo Admin',
        email,
        password: hashedPassword,
        role: 'SUPER_ADMIN' as any,
        isActive: true,
        organizationId: 'org-tasknera',
        allowJdUpload: true
      } as any
    });
    console.log(`[Success] Updated user: ${updated.email} (Role: ${updated.role})`);
  } else {
    const created = await prisma.user.create({
      data: {
        name: 'Demo Admin',
        email,
        password: hashedPassword,
        role: 'SUPER_ADMIN' as any,
        isActive: true,
        organizationId: 'org-tasknera',
        allowJdUpload: true
      } as any
    });
    console.log(`[Success] Created user: ${created.email} (Role: ${created.role})`);
  }
}

main()
  .catch((err) => {
    console.error('[Error] Failed to seed demo user:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


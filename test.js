const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ orderBy: { id: 'desc' }, take: 2 })
  .then(users => console.log(users))
  .catch(console.error)
  .finally(() => prisma.$disconnect());

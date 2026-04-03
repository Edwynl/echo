import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const blogs = await prisma.blogPost.findMany({
    select: { title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' }
  })
  console.log(JSON.stringify(blogs, null, 2))
}
main().catch(console.error).finally(()=>prisma.$disconnect())

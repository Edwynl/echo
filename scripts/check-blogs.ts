import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const blogCount = await prisma.blogPost.count()
  const blogs = await prisma.blogPost.findMany({
    take: 5,
    select: {
      id: true,
      title: true,
      status: true,
      language: true
    }
  })
  
  console.log(`Total blogs: ${blogCount}`)
  console.log('Sample blogs:', JSON.stringify(blogs, null, 2))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

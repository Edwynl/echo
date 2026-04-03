import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Data Consistency Audit ---')
  
  const videos = await prisma.video.count()
  const blogs = await prisma.blogPost.count()
  
  console.log(`Total Videos: ${videos}`)
  console.log(`Total BlogPosts: ${blogs}`)
  
  const duplicateStats = await prisma.blogPost.groupBy({
    by: ['videoId'],
    _count: {
      id: true
    },
    having: {
      videoId: {
        _count: {
          gt: 1
        }
      }
    }
  })

  if (duplicateStats.length === 0) {
    console.log('No duplicate blogs per videoId found (linked). checking orphans...')
  } else {
    console.log(`Found ${duplicateStats.length} videos with multiple blogs.`)
    for (const stat of duplicateStats) {
      if (!stat.videoId) continue;
      const video = await prisma.video.findUnique({ where: { id: stat.videoId } })
      console.log(`- Video [${video?.title}] (ID: ${stat.videoId}) has ${stat._count.id} blog posts.`)
    }
  }

  // Count blogs with null videoId (orphans or manual imports)
  const orphans = await prisma.blogPost.count({
    where: { videoId: null }
  })
  console.log(`Orphan BlogPosts (no videoId): ${orphans}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

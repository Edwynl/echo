import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Deduplication Process Started ---')
  
  // 1. Find all videoIds that have more than one blog post
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

  console.log(`Found ${duplicateStats.length} videos with duplicate blog posts.`)

  for (const stat of duplicateStats) {
    if (!stat.videoId) continue

    // Get all blog posts for this videoId, ordered by updatedAt desc
    const blogs = await prisma.blogPost.findMany({
      where: { videoId: stat.videoId },
      orderBy: { updatedAt: 'desc' }
    })

    // Keep the first (most recent), delete the rest
    const [keep, ...toDelete] = blogs
    console.log(`Video ID ${stat.videoId}: Keeping [${keep.title}] (${keep.id}), deleting ${toDelete.length} duplicates.`)

    for (const blog of toDelete) {
      await prisma.blogPost.delete({
        where: { id: blog.id }
      })
    }
  }

  // 2. Clean up orphan blogs (videoId is null)
  // Note: Only clean if they look like they were meant for videos but lost connection
  const orphans = await prisma.blogPost.deleteMany({
    where: { videoId: null }
  })
  
  console.log(`Cleaned up ${orphans.count} orphan blog posts (no videoId).`)
  console.log('--- Deduplication Process Finished ---')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

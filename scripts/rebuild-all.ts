import { PrismaClient } from '@prisma/client'
import { minimaxService } from '../src/services/minimax'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(__dirname, '../.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('--- Starting Bulk Blog Rebuild ---')
  
  const blogs = await prisma.blogPost.findMany({
    include: {
      video: {
        include: {
          channel: true
        }
      }
    }
  })

  console.log(`Found ${blogs.length} blogs to process.`)

  for (const blog of blogs) {
    if (!blog.video || !blog.video.transcript) {
      console.log(`Skipping blog: ${blog.title} (Reason: Missing video or transcript)`)
      continue
    }

    try {
      console.log(`\nProcessing: ${blog.title}...`)
      
      const newContent = await minimaxService.generateBlogPost(
        blog.video.title,
        blog.video.description || '',
        blog.video.transcript,
        blog.video.channel.name,
        `https://youtube.com/watch?v=${blog.video.youtubeId}`,
        blog.video.thumbnail || ''
      )

      // Parse summary
      let excerpt = blog.excerpt
      const summaryMatch = newContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
      if (summaryMatch) {
        excerpt = summaryMatch[1].trim()
      }

      // Strip markers
      const clearContent = newContent
        .replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '')
        .trim()

      await prisma.blogPost.update({
        where: { id: blog.id },
        data: {
          content: clearContent,
          excerpt: excerpt,
          updatedAt: new Date()
        }
      })

      console.log(`SUCCESS: ${blog.title} updated.`)
    } catch (err: any) {
      console.error(`FAILED: ${blog.title}. Error: ${err.message}`)
    }
  }

  console.log('\n--- Bulk Rebuild Finished ---')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

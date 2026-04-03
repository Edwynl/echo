import { MiniMaxService } from '../src/services/minimax';
import { prisma } from '../src/lib/prisma';
import dotenv from 'dotenv';
dotenv.config();

const minimaxService = new MiniMaxService();

// Get LLM service based on provider setting
function getLLMService() {
  // Currently only MiniMax is implemented
  // Local LLM support can be added later
  console.log('Using MiniMax API for updates');
  return minimaxService;
}

async function main() {
  const llmService = await getLLMService();
  console.log('Fetching blogs with messy excerpts...');
  const blogs = await prisma.blogPost.findMany({
    where: {
      OR: [
        { excerpt: { contains: 'http' } },
        { excerpt: { contains: 'skool' } },
        { excerpt: { contains: 'Subscribe' } },
        { excerpt: { contains: 'Join' } },
        { excerpt: { equals: '' } }
      ]
    }
  });

  console.log(`Found ${blogs.length} blogs to update.`);

  let updatedCount = 0;
  for (const blog of blogs) {
    console.log(`[${updatedCount + 1}/${blogs.length}] Processing: ${blog.title}`);
    try {
      const summary = await llmService.generateOneSentenceSummary(blog.content);
      
      if (summary) {
        await prisma.blogPost.update({
          where: { id: blog.id },
          data: { excerpt: summary }
        });
        console.log(`   Result: ${summary}`);
        updatedCount++;
      }
    } catch (e: any) {
      console.error(`   Failed: ${e.message}`);
    }

    // Delay to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nBatch update complete. ${updatedCount} blogs updated successfully.`);
}

main()
  .catch(e => console.error('Fatal error:', e))
  .finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = process.env.MINIMAX_BASE_URL;
const MODEL = 'MiniMax-Text-01'; // abab6.5s-chat was not found

async function generateSummary(title, content) {
  const systemPrompt = `你是一位极简主义的技术内容编辑。你的任务是将长篇文章缩减为一句精华总结。

## 要求：
1. 必须只有一句话。
2. 长度在 60-100 字左右。
3. 语气专业、客观、吸引人。
4. 严禁包含：链接、推广内容、Emoji、日期、作者信息。
5. 仅输出摘要正文，不要包含任何标签或前缀。`;

  const userPrompt = `标题: ${title}\n内容: ${content.slice(0, 6000)}\n\n请为以上内容写一句精准的总结：`;

  try {
    const res = await fetch(`${BASE_URL}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (!data.choices || data.choices.length === 0) {
      console.error('API Response missing choices:', JSON.stringify(data));
      throw new Error('No choices in response');
    }
    
    let result = data.choices[0].message.content.trim();
    // Clean up common AI prefixes
    result = result.replace(/^摘要[:：]\s*/, '')
                  .replace(/^总结[:：]\s*/, '')
                  .replace(/^一句话总结[:：]\s*/, '')
                  .replace(/[\[\]]/g, '');
    
    return result;
  } catch (e) {
    console.error(`Error calling AI for "${title}":`, e.message);
    return null;
  }
}

async function main() {
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
    const summary = await generateSummary(blog.title, blog.content);
    
    if (summary) {
      await prisma.blogPost.update({
        where: { id: blog.id },
        data: { excerpt: summary }
      });
      console.log(`   Result: ${summary}`);
      updatedCount++;
    }

    // Delay to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nBatch update complete. ${updatedCount} blogs updated successfully.`);
}

main()
  .catch(e => console.error('Fatal error:', e))
  .finally(() => prisma.$disconnect());

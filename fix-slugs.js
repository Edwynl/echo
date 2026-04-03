const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function decodeHtmlEntities(text) {
  if (!text) return ''
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '—')
}

function slugify(text) {
  return decodeHtmlEntities(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  console.log('--- Starting Slug Fixer ---')
  const blogs = await prisma.blogPost.findMany({
    select: { id: true, title: true, slug: true }
  })

  for (const blog of blogs) {
    const newSlugBase = slugify(blog.title)
    
    if (blog.slug.includes('quot') || !blog.slug.startsWith(newSlugBase)) {
      console.log(`Fixing: "${blog.title}"`)
      console.log(`  Old: ${blog.slug}`)
      
      const match = blog.slug.match(/-(\d+)$/)
      const suffix = match ? match[1] : Date.now().toString()
      const finalSlug = `${newSlugBase}-${suffix}`
      
      console.log(`  New: ${finalSlug}`)
      
      try {
        await prisma.blogPost.update({
          where: { id: blog.id },
          data: { slug: finalSlug }
        })
      } catch (e) {
        console.error(`  Failed to update ${blog.id}:`, e)
      }
    }
  }
  console.log('--- Slug Fixer Finished ---')
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())

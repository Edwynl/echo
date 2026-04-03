/**
 * Database Cleanup Script
 *
 * This script cleans up:
 * 1. Failed KnowledgeSource records older than 90 days
 * 2. Orphaned BlogPost records (no video and no knowledgeSource)
 *
 * Usage:
 *   npx ts-node scripts/cleanup.ts
 *   npx ts-node scripts/cleanup.ts --dry-run  (preview without deleting)
 *   npx ts-node scripts/cleanup.ts --days=30 (custom retention period)
 *
 * Recommended to run as a cron job:
 *   0 2 * * * cd /path/to/project && npx ts-node scripts/cleanup.ts >> logs/cleanup.log 2>&1
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Configuration
interface CleanupConfig {
  dryRun: boolean
  daysOld: number
  batchSize: number
}

// Parse command line arguments
function parseArgs(): CleanupConfig {
  const args = process.argv.slice(2)
  const config: CleanupConfig = {
    dryRun: false,
    daysOld: 90,
    batchSize: 100,
  }

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-n') {
      config.dryRun = true
    } else if (arg.startsWith('--days=')) {
      const days = parseInt(arg.split('=')[1], 10)
      if (!isNaN(days) && days > 0) {
        config.daysOld = days
      }
    } else if (arg.startsWith('--batch=')) {
      const batch = parseInt(arg.split('=')[1], 10)
      if (!isNaN(batch) && batch > 0) {
        config.batchSize = batch
      }
    }
  }

  return config
}

// Calculate the cutoff date
function getCutoffDate(daysOld: number): Date {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysOld)
  return cutoff
}

/**
 * Clean up failed KnowledgeSource records older than the specified days
 */
async function cleanupFailedSources(cutoffDate: Date, dryRun: boolean): Promise<number> {
  console.log(`\n[KnowledgeSource Cleanup]`)
  console.log(`  Looking for failed records older than: ${cutoffDate.toISOString()}`)

  // Find failed sources
  const failedSources = await prisma.knowledgeSource.findMany({
    where: {
      status: 'failed',
      updatedAt: {
        lt: cutoffDate,
      },
    },
    select: {
      id: true,
      sourceUrl: true,
      title: true,
      errorMessage: true,
      updatedAt: true,
    },
    take: 100, // Process in batches
  })

  if (failedSources.length === 0) {
    console.log('  No failed sources to clean up.')
    return 0
  }

  console.log(`  Found ${failedSources.length} failed sources to clean up:`)

  for (const source of failedSources) {
    console.log(`    - ${source.title} (${source.sourceUrl})`)
    console.log(`      Error: ${source.errorMessage?.slice(0, 100) || 'N/A'}...`)
    console.log(`      Last updated: ${source.updatedAt.toISOString()}`)
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No records were deleted.')
    return failedSources.length
  }

  // Delete the failed sources
  const deleteResult = await prisma.knowledgeSource.deleteMany({
    where: {
      id: {
        in: failedSources.map(s => s.id),
      },
    },
  })

  console.log(`  Deleted ${deleteResult.count} failed sources.`)
  return deleteResult.count
}

/**
 * Clean up orphaned BlogPost records (no video and no knowledgeSource)
 */
async function cleanupOrphanedBlogs(dryRun: boolean): Promise<number> {
  console.log(`\n[BlogPost Cleanup]`)
  console.log(`  Looking for orphaned blog posts (no video and no knowledgeSource)...)

  // Find orphaned blogs
  const orphanedBlogs = await prisma.blogPost.findMany({
    where: {
      videoId: null,
      knowledgeSourceId: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      generatedAt: true,
    },
    take: 100, // Process in batches
  })

  if (orphanedBlogs.length === 0) {
    console.log('  No orphaned blogs to clean up.')
    return 0
  }

  console.log(`  Found ${orphanedBlogs.length} orphaned blogs:`)
  for (const blog of orphanedBlogs) {
    console.log(`    - ${blog.title} (slug: ${blog.slug})`)
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No records were deleted.')
    return orphanedBlogs.length
  }

  // Delete the orphaned blogs
  const deleteResult = await prisma.blogPost.deleteMany({
    where: {
      id: {
        in: orphanedBlogs.map(b => b.id),
      },
    },
  })

  console.log(`  Deleted ${deleteResult.count} orphaned blogs.`)
  return deleteResult.count
}

/**
 * Clean up stale pending/processing sources (stuck for more than 24 hours)
 */
async function cleanupStaleProcessing(dutoffDate: Date, dryRun: boolean): Promise<number> {
  console.log(`\n[Stale Processing Cleanup]`)
  console.log(`  Looking for stuck sources (pending/processing for more than 24 hours)...`)

  // Find stale sources
  const staleSources = await prisma.knowledgeSource.findMany({
    where: {
      status: {
        in: ['pending', 'processing'],
      },
      updatedAt: {
        lt: dutoffDate,
      },
    },
    select: {
      id: true,
      sourceUrl: true,
      title: true,
      status: true,
      updatedAt: true,
    },
    take: 100,
  })

  if (staleSources.length === 0) {
    console.log('  No stale processing sources to clean up.')
    return 0
  }

  console.log(`  Found ${staleSources.length} stale sources:`)
  for (const source of staleSources) {
    console.log(`    - ${source.title} (${source.sourceUrl}) - Status: ${source.status}`)
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No records were modified.')
    return staleSources.length
  }

  // Mark as failed
  const updateResult = await prisma.knowledgeSource.updateMany({
    where: {
      id: {
        in: staleSources.map(s => s.id),
      },
    },
    data: {
      status: 'failed',
      errorMessage: 'Processing timed out and was marked as failed by cleanup script.',
    },
  })

  console.log(`  Marked ${updateResult.count} sources as failed.`)
  return updateResult.count
}

/**
 * Get database statistics
 */
async function getStats(): Promise<void> {
  console.log('\n[Database Statistics]')

  const [
    totalSources,
    failedSources,
    pendingSources,
    processingSources,
    completedSources,
    totalBlogs,
    orphanedBlogs,
  ] = await Promise.all([
    prisma.knowledgeSource.count(),
    prisma.knowledgeSource.count({ where: { status: 'failed' } }),
    prisma.knowledgeSource.count({ where: { status: 'pending' } }),
    prisma.knowledgeSource.count({ where: { status: 'processing' } }),
    prisma.knowledgeSource.count({ where: { status: 'completed' } }),
    prisma.blogPost.count(),
    prisma.blogPost.count({
      where: {
        videoId: null,
        knowledgeSourceId: null,
      },
    }),
  ])

  console.log(`  Knowledge Sources:`)
  console.log(`    Total: ${totalSources}`)
  console.log(`    Failed: ${failedSources}`)
  console.log(`    Pending: ${pendingSources}`)
  console.log(`    Processing: ${processingSources}`)
  console.log(`    Completed: ${completedSources}`)
  console.log(`  Blog Posts:`)
  console.log(`    Total: ${totalBlogs}`)
  console.log(`    Orphaned: ${orphanedBlogs}`)
}

/**
 * Main cleanup function
 */
async function main() {
  const config = parseArgs()

  console.log('='.repeat(60))
  console.log('Database Cleanup Script')
  console.log('='.repeat(60))
  console.log(`Configuration:`)
  console.log(`  Dry run: ${config.dryRun ? 'Yes' : 'No'}`)
  console.log(`  Retention period: ${config.daysOld} days`)
  console.log(`  Batch size: ${config.batchSize}`)
  console.log(`  Cutoff date: ${getCutoffDate(config.daysOld).toISOString()}`)

  // Show current statistics
  await getStats()

  const cutoffDate = getCutoffDate(config.daysOld)

  // Track totals
  let totalDeleted = 0
  let totalMarkedFailed = 0

  // Clean up failed sources
  const deletedFailed = await cleanupFailedSources(cutoffDate, config.dryRun)
  totalDeleted += deletedFailed

  // Clean up orphaned blogs
  const deletedOrphaned = await cleanupOrphanedBlogs(config.dryRun)
  totalDeleted += deletedOrphaned

  // Clean up stale processing sources
  const staleCutoff = new Date()
  staleCutoff.setHours(staleCutoff.getHours() - 24)
  const markedFailed = await cleanupStaleProcessing(staleCutoff, config.dryRun)
  totalMarkedFailed += markedFailed

  // Final statistics
  console.log('\n' + '='.repeat(60))
  console.log('Cleanup Summary')
  console.log('='.repeat(60))
  console.log(`  Records deleted: ${totalDeleted}`)
  console.log(`  Records marked as failed: ${totalMarkedFailed}`)

  if (!config.dryRun) {
    await getStats()
  }

  console.log('\nCleanup completed!')
}

// Run the cleanup
main()
  .catch((error) => {
    console.error('Error during cleanup:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

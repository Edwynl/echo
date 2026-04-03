/**
 * Zod validation schemas for API routes
 */

import { z } from 'zod';

/**
 * URL validation helper
 * Validates that a string is a valid URL and optionally checks for specific domains
 */
const urlValidation = (options?: {
  allowedDomains?: string[];
  requireHttps?: boolean;
}) => {
  return z.string().url('Invalid URL format').refine((url) => {
    try {
      const parsed = new URL(url);
      const protocol = options?.requireHttps ? 'https:' : undefined;
      if (protocol && parsed.protocol !== protocol) {
        return false;
      }
      if (options?.allowedDomains && options.allowedDomains.length > 0) {
        return options.allowedDomains.some(domain =>
          parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
        );
      }
      return true;
    } catch {
      return false;
    }
  }, 'URL does not meet requirements');
};

/**
 * Source Type enum
 */
export const SourceTypeEnum = z.enum(['YOUTUBE', 'GITHUB', 'WEB', 'YOUTUBE_CHANNEL']);

/**
 * Schema for adding a new knowledge source
 * POST /api/sources/add
 */
export const addSourceSchema = z.object({
  sourceUrl: z.string()
    .min(1, 'Source URL is required')
    .max(2000, 'URL is too long')
    .refine(
      (url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid URL format' }
    ),
  sourceType: SourceTypeEnum.optional(),
  projectGroupId: z.string().cuid().optional(),
});

/**
 * Schema for blog post creation
 * POST /api/blogs
 */
export const createBlogSchema = z.object({
  videoId: z.string()
    .min(1, 'Video ID is required')
    .cuid('Invalid video ID format'),
  forceRegenerate: z.boolean().optional().default(false),
  categoryId: z.string().cuid('Invalid category ID format').optional(),
});

/**
 * Schema for blog post filtering
 * GET /api/blogs
 */
export const blogQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).nullable().optional(),
  channelId: z.string().nullable().optional(),
  knowledgeSourceId: z.string().nullable().optional(),
  search: z.string().max(200).nullable().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Schema for blog post deletion
 * DELETE /api/blogs
 */
export const deleteBlogSchema = z.object({
  id: z.string().cuid('Invalid blog ID format').optional(),
  deleteAll: z.enum(['true', 'false']).optional(),
  channelId: z.string().cuid().optional(),
});

/**
 * Type exports from schemas
 */
export type AddSourceInput = z.infer<typeof addSourceSchema>;
export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type BlogQueryInput = z.infer<typeof blogQuerySchema>;
export type DeleteBlogInput = z.infer<typeof deleteBlogSchema>;

/**
 * Validation helper function
 * Returns parsed data if valid, or throws error with details
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod error into user-friendly message
 */
export function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return issues.join('; ');
}

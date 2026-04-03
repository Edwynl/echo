-- CreateTable
CREATE TABLE "ProjectGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "processedContent" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "thumbnail" TEXT,
    "author" TEXT,
    "tags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "projectGroupId" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeSource_projectGroupId_fkey" FOREIGN KEY ("projectGroupId") REFERENCES "ProjectGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConceptRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concept1" TEXT NOT NULL,
    "concept2" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "sourceIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlogPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "tags" TEXT,
    "coverImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "videoId" TEXT,
    "sourceUrl" TEXT,
    "knowledgeSourceId" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BlogPost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BlogPost_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BlogPost" ("content", "coverImage", "excerpt", "generatedAt", "id", "publishedAt", "slug", "sourceUrl", "status", "tags", "title", "updatedAt", "videoId") SELECT "content", "coverImage", "excerpt", "generatedAt", "id", "publishedAt", "slug", "sourceUrl", "status", "tags", "title", "updatedAt", "videoId" FROM "BlogPost";
DROP TABLE "BlogPost";
ALTER TABLE "new_BlogPost" RENAME TO "BlogPost";
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE UNIQUE INDEX "BlogPost_videoId_key" ON "BlogPost"("videoId");
CREATE INDEX "BlogPost_slug_idx" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_status_idx" ON "BlogPost"("status");
CREATE INDEX "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");
CREATE INDEX "BlogPost_knowledgeSourceId_idx" ON "BlogPost"("knowledgeSourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KnowledgeSource_sourceType_idx" ON "KnowledgeSource"("sourceType");

-- CreateIndex
CREATE INDEX "KnowledgeSource_status_idx" ON "KnowledgeSource"("status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_projectGroupId_idx" ON "KnowledgeSource"("projectGroupId");

-- CreateIndex
CREATE INDEX "ConceptRelation_concept1_idx" ON "ConceptRelation"("concept1");

-- CreateIndex
CREATE INDEX "ConceptRelation_concept2_idx" ON "ConceptRelation"("concept2");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptRelation_concept1_concept2_relationType_key" ON "ConceptRelation"("concept1", "concept2", "relationType");

-- DropForeignKey
ALTER TABLE "ObjectVersion" DROP CONSTRAINT "ObjectVersion_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeVersion" DROP CONSTRAINT "ResumeVersion_ownerUserId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeVersionItem" DROP CONSTRAINT "ResumeVersionItem_objectVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeVersionItem" DROP CONSTRAINT "ResumeVersionItem_resumeVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeVersionSection" DROP CONSTRAINT "ResumeVersionSection_resumeVersionId_fkey";

-- DropTable
DROP TABLE "ObjectVersion";

-- DropTable
DROP TABLE "ResumeVersion";

-- DropTable
DROP TABLE "ResumeVersionItem";

-- DropTable
DROP TABLE "ResumeVersionSection";

-- CreateTable
CREATE TABLE "ResumeObject" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" "ObjectType" NOT NULL,

    CONSTRAINT "ResumeObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectVariation" (
    "id" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ObjectVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectRevision" (
    "id" TEXT NOT NULL,
    "objectVariationId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeRevision" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeSection" (
    "id" TEXT NOT NULL,
    "resumeRevisionId" TEXT NOT NULL,
    "sectionType" "ObjectType" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ResumeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionObject" (
    "id" TEXT NOT NULL,
    "resumeSectionId" TEXT NOT NULL,
    "objectRevisionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "SectionObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumeObject_ownerUserId_idx" ON "ResumeObject"("ownerUserId");

-- CreateIndex
CREATE INDEX "ObjectVariation_objectId_idx" ON "ObjectVariation"("objectId");

-- CreateIndex
CREATE INDEX "ObjectRevision_objectVariationId_idx" ON "ObjectRevision"("objectVariationId");

-- CreateIndex
CREATE INDEX "Resume_ownerUserId_idx" ON "Resume"("ownerUserId");

-- CreateIndex
CREATE INDEX "Resume_parentVersionId_idx" ON "Resume"("parentVersionId");

-- CreateIndex
CREATE INDEX "ResumeRevision_resumeId_idx" ON "ResumeRevision"("resumeId");

-- CreateIndex
CREATE INDEX "ResumeSection_resumeRevisionId_idx" ON "ResumeSection"("resumeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeSection_resumeRevisionId_sectionType_key" ON "ResumeSection"("resumeRevisionId", "sectionType");

-- CreateIndex
CREATE INDEX "SectionObject_resumeSectionId_idx" ON "SectionObject"("resumeSectionId");

-- CreateIndex
CREATE INDEX "SectionObject_objectRevisionId_idx" ON "SectionObject"("objectRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionObject_resumeSectionId_order_key" ON "SectionObject"("resumeSectionId", "order");

-- AddForeignKey
ALTER TABLE "ResumeObject" ADD CONSTRAINT "ResumeObject_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVariation" ADD CONSTRAINT "ObjectVariation_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "ResumeObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectRevision" ADD CONSTRAINT "ObjectRevision_objectVariationId_fkey" FOREIGN KEY ("objectVariationId") REFERENCES "ObjectVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeRevision" ADD CONSTRAINT "ResumeRevision_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeSection" ADD CONSTRAINT "ResumeSection_resumeRevisionId_fkey" FOREIGN KEY ("resumeRevisionId") REFERENCES "ResumeRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionObject" ADD CONSTRAINT "SectionObject_resumeSectionId_fkey" FOREIGN KEY ("resumeSectionId") REFERENCES "ResumeSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionObject" ADD CONSTRAINT "SectionObject_objectRevisionId_fkey" FOREIGN KEY ("objectRevisionId") REFERENCES "ObjectRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


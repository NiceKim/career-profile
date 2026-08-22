-- CreateEnum
CREATE TYPE "ObjectType" AS ENUM ('WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROJECT', 'CERTIFICATION', 'EXTRACURRICULAR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "links" JSONB NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectVersion" (
    "id" TEXT NOT NULL,
    "rootVersionId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "type" "ObjectType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "rootVersionId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersionSection" (
    "id" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "sectionType" "ObjectType" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ResumeVersionSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersionItem" (
    "id" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "objectVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ResumeVersionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "ObjectVersion_ownerUserId_idx" ON "ObjectVersion"("ownerUserId");

-- CreateIndex
CREATE INDEX "ObjectVersion_rootVersionId_idx" ON "ObjectVersion"("rootVersionId");

-- CreateIndex
CREATE INDEX "ResumeVersion_ownerUserId_idx" ON "ResumeVersion"("ownerUserId");

-- CreateIndex
CREATE INDEX "ResumeVersion_rootVersionId_idx" ON "ResumeVersion"("rootVersionId");

-- CreateIndex
CREATE INDEX "ResumeVersion_parentVersionId_idx" ON "ResumeVersion"("parentVersionId");

-- CreateIndex
CREATE INDEX "ResumeVersionSection_resumeVersionId_idx" ON "ResumeVersionSection"("resumeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersionSection_resumeVersionId_sectionType_key" ON "ResumeVersionSection"("resumeVersionId", "sectionType");

-- CreateIndex
CREATE INDEX "ResumeVersionItem_resumeVersionId_idx" ON "ResumeVersionItem"("resumeVersionId");

-- CreateIndex
CREATE INDEX "ResumeVersionItem_objectVersionId_idx" ON "ResumeVersionItem"("objectVersionId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersionSection" ADD CONSTRAINT "ResumeVersionSection_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersionItem" ADD CONSTRAINT "ResumeVersionItem_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersionItem" ADD CONSTRAINT "ResumeVersionItem_objectVersionId_fkey" FOREIGN KEY ("objectVersionId") REFERENCES "ObjectVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

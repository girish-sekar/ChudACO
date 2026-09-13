-- CreateTable
CREATE TABLE IF NOT EXISTS "Retailer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Retailer_name_key" ON "Retailer"("name");

-- Insert initial supported retailers
INSERT INTO "Retailer" ("id", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('ret_target', 'Target', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ret_pkc', 'Pokemon Center', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ret_sams', 'Sam''s Club', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ret_costco', 'Costco', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ret_bandai', 'Bandai', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

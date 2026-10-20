INSERT INTO "Retailer" ("id", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('ret_mattel', 'Mattel', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
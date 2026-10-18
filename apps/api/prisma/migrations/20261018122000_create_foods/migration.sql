-- Extensions
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "foods" (
    "id" SERIAL NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serving_size_g" DOUBLE PRECISION,
    "kcal_per_100g" DOUBLE PRECISION NOT NULL,
    "protein_g_per_100g" DOUBLE PRECISION NOT NULL,
    "carbs_g_per_100g" DOUBLE PRECISION NOT NULL,
    "fat_g_per_100g" DOUBLE PRECISION NOT NULL,
    "fiber_g_per_100g" DOUBLE PRECISION,
    "sugar_g_per_100g" DOUBLE PRECISION,
    "sodium_mg_per_100g" DOUBLE PRECISION,
    "saturated_fat_g_per_100g" DOUBLE PRECISION,
    "micros" JSONB NOT NULL,
    "is_vegetarian" BOOLEAN,
    "has_lactose" BOOLEAN,
    "has_gluten" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_measures" (
    "id" SERIAL NOT NULL,
    "food_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "food_measures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foods_source_key_key" ON "foods"("source_key");

-- CreateIndex
CREATE INDEX "food_measures_food_id_idx" ON "food_measures"("food_id");

-- AddForeignKey
ALTER TABLE "food_measures" ADD CONSTRAINT "food_measures_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

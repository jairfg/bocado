-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "embedding_model" TEXT,
ADD COLUMN     "embedding_text_hash" TEXT;

-- CreateIndex (a mano: Prisma no soporta índices HNSW)
-- vector_cosine_ops porque la búsqueda ordena por distancia coseno (<=>).
CREATE INDEX "foods_embedding_hnsw_idx" ON "foods" USING hnsw ("embedding" vector_cosine_ops);

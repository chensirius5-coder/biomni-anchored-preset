# ============================================================================
# thorplab_neonatal_regeneration_workflow.R
# ----------------------------------------------------------------------------
# Parameterized, cleaned version of the Thorp lab analysis workflow for
# "Early-age efferocytosis directs macrophage arachidonic acid metabolism for
# tissue regeneration" (Lantz et al., Immunity 2025; GSE241928).
# Source: https://github.com/thorplab/Neonatal_Regeneration
#         (Lantz_Regeneration_Manuscript (3).Rmd)
#
# Usage:
#   Rscript thorplab_neonatal_regeneration_workflow.R <data_dir> <out_dir>
#   <data_dir>: directory containing one subfolder per 10x sample
#               (WT_P1_Sh, WT_P1_MI_1, WT_P1_MI_2, WT_Ad_Sh, WT_Ad_MI,
#                MER_Sh, MER_MI), each with barcodes.tsv.gz / features.tsv.gz /
#                matrix.mtx.gz (or the CellRanger outs/filtered_feature_bc_matrix).
#   <out_dir>:  output directory (RDS objects, tables, figures).
# ============================================================================

suppressPackageStartupMessages({
  library(Seurat)
  library(sctransform)
  library(glmGamPoi)
  library(dplyr)
  library(Matrix)
  library(ggplot2)
  library(cowplot)
})
options(future.globals.maxSize = 15e9)

args <- commandArgs(trailingOnly = TRUE)
data_dir <- if (length(args) >= 1) args[1] else "DATA"
out_dir  <- if (length(args) >= 2) args[2] else "RESULTS"
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

# ---------------------------------------------------------------------------
# 0. Configuration
# ---------------------------------------------------------------------------
# GSE241928 sample names (WT P1 / WT adult / MerTK-KO, sham or MI)
samples <- c("WT_P1_Sh", "WT_P1_MI_1", "WT_P1_MI_2",
             "WT_Ad_Sh", "WT_Ad_MI", "MER_Sh", "MER_MI")
# Map each sample to its biological condition
condition_map <- c(WT_P1_Sh = "WT_P1_Sh", WT_P1_MI_1 = "WT_P1_MI", WT_P1_MI_2 = "WT_P1_MI",
                   WT_Ad_Sh = "WT_Ad_Sh", WT_Ad_MI = "WT_Ad_MI",
                   MER_Sh = "MER_Sh", MER_MI = "MER_MI")

# QC thresholds (from the paper workflow)
qc_min_umi   <- 500
qc_min_genes <- 250
qc_min_novelty <- 0.80   # log10GenesPerUMI
qc_max_mito  <- 0.30
qc_min_cells_per_gene <- 3

# ---------------------------------------------------------------------------
# 1. Load CellRanger matrices and merge
# ---------------------------------------------------------------------------
seurat_list <- list()
for (s in samples) {
  path <- file.path(data_dir, s)
  if (!dir.exists(path)) path <- file.path(data_dir, s, "filtered_feature_bc_matrix")
  counts <- Read10X(data.dir = path)
  seurat_list[[s]] <- CreateSeuratObject(counts = counts,
                                         min.features = 100,
                                         project = s)
}
merged <- merge(x = seurat_list[[1]],
                y = seurat_list[-1],
                add.cell.ids = samples)

# ---------------------------------------------------------------------------
# 2. QC metrics and filtering
# ---------------------------------------------------------------------------
merged$log10GenesPerUMI <- log10(merged$nFeature_RNA) / log10(merged$nCount_RNA)
merged$mitoRatio <- PercentageFeatureSet(merged, pattern = "^mt-") / 100
merged$riboRatio <- PercentageFeatureSet(merged, pattern = "^Rp[ls]") / 100

meta <- merged@meta.data
meta$cells <- rownames(meta)
meta$sample <- condition_map[meta$orig.ident]
merged@meta.data <- meta

filtered <- subset(merged,
                   subset = nCount_RNA >= qc_min_umi &
                            nFeature_RNA >= qc_min_genes &
                            log10GenesPerUMI > qc_min_novelty &
                            mitoRatio < qc_max_mito)
counts <- GetAssayData(filtered, slot = "counts")
keep_genes <- Matrix::rowSums(counts > 0) >= qc_min_cells_per_gene
filtered <- CreateSeuratObject(counts[keep_genes, ],
                               meta.data = filtered@meta.data)
message(sprintf("After QC: %d cells, %d features", ncol(filtered), nrow(filtered)))

# ---------------------------------------------------------------------------
# 3. Cell cycle scoring, SCT normalization and integration
# ---------------------------------------------------------------------------
filtered <- NormalizeData(filtered)
filtered <- FindVariableFeatures(filtered, selection.method = "vst")
filtered <- ScaleData(filtered, features = rownames(filtered))
filtered <- RunPCA(filtered, features = VariableFeatures(filtered))
filtered <- CellCycleScoring(filtered, s.features = cc.genes$s.genes,
                             g2m.features = cc.genes$g2m.genes, set.ident = TRUE)
filtered$CC.Difference <- filtered$S.Score - filtered$G2M.Score

split_seurat <- SplitObject(filtered, split.by = "sample")
for (i in seq_along(split_seurat)) {
  split_seurat[[i]] <- SCTransform(split_seurat[[i]], vst.flavor = "v2",
                                   vars.to.regress = c("CC.Difference", "mitoRatio"),
                                   method = "glmGamPoi", verbose = FALSE)
}
integ_features <- SelectIntegrationFeatures(object.list = split_seurat, nfeatures = 4000)
split_seurat <- PrepSCTIntegration(object.list = split_seurat,
                                   anchor.features = integ_features, verbose = FALSE)
integ_anchors <- FindIntegrationAnchors(object.list = split_seurat,
                                        normalization.method = "SCT",
                                        anchor.features = integ_features, verbose = FALSE)
integrated <- IntegrateData(anchorset = integ_anchors,
                            normalization.method = "SCT", verbose = FALSE)

DefaultAssay(integrated) <- "integrated"
integrated <- RunPCA(integrated, npcs = 100, verbose = FALSE)
integrated <- RunUMAP(integrated, reduction = "pca", dims = 1:60, verbose = FALSE)
# Validate batch correction: DimPlot(integrated, split.by = "sample")

# ---------------------------------------------------------------------------
# 4. Clustering, marker identification and cell-type annotation
# ---------------------------------------------------------------------------
integrated <- FindNeighbors(integrated, dims = 1:60, verbose = FALSE)
integrated <- FindClusters(integrated, resolution = c(0.2, 0.4, 0.6, 0.8, 1.0, 1.4),
                           verbose = FALSE)
Idents(integrated) <- "integrated_snn_res.0.4"

# Cluster markers (MAST; adjust ident.1 loop to 0:n_clusters-1)
DefaultAssay(integrated) <- "RNA"
for (i in sort(unique(as.integer(as.character(Idents(integrated)))))) {
  markers <- FindMarkers(integrated, ident.1 = i, test.use = "MAST",
                         only.pos = TRUE, verbose = FALSE)
  markers <- subset(markers, p_val_adj < 0.05 & abs(avg_log2FC) > 0.5)
  write.csv(markers, file.path(out_dir, sprintf("cluster_%d_markers.csv", i)))
}
DefaultAssay(integrated) <- "SCT"

# SingleR annotation (requires celldex + SingleR; optional)
# library(SingleR); library(celldex)
# immgen <- celldex::ImmGenData()
# pred <- SingleR(test = GetAssayData(integrated, assay = "SCT"),
#                 ref = immgen, labels = immgen$label.main, de.method = "wilcox")
# integrated$SingleR.labels <- pred$labels

# Example identity map used in the paper (adjust to your clustering):
# 0 Neutrophils, 1 Macrophages, 2 B Cells, 3 Fibroblasts, 4 Endothelial Cells,
# 5 Monocytes, 6 Fibroblasts, 7 T Cells, 8 Dendritic Cells, 9 Dying Cells,
# 10 NK Cells, 13 Cardiomyocytes, 14 VSMCs, 18 NKT Cells, 19 ILCs,
# 22 Neutrophils, 23 Neurons, 24 Basophils ...

# ---------------------------------------------------------------------------
# 5. Myeloid sub-analysis
# ---------------------------------------------------------------------------
myeloid <- subset(integrated, idents = c("Macrophages", "Monocytes",
                                         "Dendritic Cells", "Neutrophils"))
split_my <- SplitObject(myeloid, split.by = "sample")
for (i in seq_along(split_my)) {
  split_my[[i]] <- SCTransform(split_my[[i]], vst.flavor = "v2",
                               vars.to.regress = c("CC.Difference", "mitoRatio"),
                               method = "glmGamPoi", verbose = FALSE)
}
my_features <- SelectIntegrationFeatures(object.list = split_my, nfeatures = 3000)
split_my <- PrepSCTIntegration(object.list = split_my, anchor.features = my_features,
                               verbose = FALSE)
my_anchors <- FindIntegrationAnchors(object.list = split_my,
                                     normalization.method = "SCT",
                                     anchor.features = my_features, verbose = FALSE)
myeloid <- IntegrateData(anchorset = my_anchors, normalization.method = "SCT",
                         verbose = FALSE)
DefaultAssay(myeloid) <- "integrated"
myeloid <- RunPCA(myeloid, npcs = 50, verbose = FALSE)
myeloid <- RunUMAP(myeloid, dims = 1:30, verbose = FALSE)
myeloid <- FindNeighbors(myeloid, dims = 1:30, verbose = FALSE)
myeloid <- FindClusters(myeloid, resolution = c(0.4, 0.6, 0.8), verbose = FALSE)

# Paper identities for myeloid subsets:
# C1q+ TLF+ Macrophages, Prolif. C1q+ Macrophages, Arg1+ Macrophages,
# Ccr2+ Macrophages, Spp1+ Macrophages, Ly6chi Monocytes, Ly6clo Monocytes

# ---------------------------------------------------------------------------
# 6. Module scoring (efferocytosis / AA programs)
# ---------------------------------------------------------------------------
efferocytosis_genes <- list(c("Mertk", "Gas6", "Axl", "Tyro3", "C1qa", "C1qb",
                              "C1qc", "Cd36", "Timd4", "Lrp1"))
myeloid <- AddModuleScore(myeloid, features = efferocytosis_genes, name = "Efferocytosis")

aa_enzymes <- list(c("Pla2g4a", "Pla2g7", "Pla2g15", "Alox5", "Alox5ap",
                     "Alox12", "Alox15", "Ptgs1", "Ptgs2", "Ptges2",
                     "Hpgds", "Hpgd", "Tbxas1", "Prxl2b", "Ltc4s"))
myeloid <- AddModuleScore(myeloid, features = aa_enzymes, name = "ArachidonicAcid")

# ---------------------------------------------------------------------------
# 7. Differential expression (neonate MI vs adult MI per macrophage subset)
# ---------------------------------------------------------------------------
myeloid$cluster_sample <- paste0(Idents(myeloid), "_", myeloid$sample)
Idents(myeloid) <- "cluster_sample"
for (cell in unique(Idents(myeloid))) {
  group <- sub("_.*$", "", cell)
  neonate <- paste0(group, "_WT_P1_MI")
  adult   <- paste0(group, "_WT_Ad_MI")
  if (all(c(neonate, adult) %in% Idents(myeloid))) {
    de <- FindMarkers(myeloid, ident.1 = neonate, ident.2 = adult,
                      test.use = "MAST", verbose = FALSE)
    write.csv(de, file.path(out_dir, sprintf("DE_%s_NeoMI_vs_AdMI.csv", group)))
  }
}

# ---------------------------------------------------------------------------
# 8. CellChat (per condition) — optional, requires CellChat
# ---------------------------------------------------------------------------
# library(CellChat)
# for (cond in c("WT_P1_Sh", "WT_P1_MI", "WT_Ad_Sh", "WT_Ad_MI")) {
#   obj <- subset(integrated, sample == cond)
#   data.input <- GetAssayData(obj, assay = "RNA", slot = "data")
#   meta <- data.frame(group = as.character(Idents(obj)), row.names = colnames(obj))
#   cc <- createCellChat(object = data.input, meta = meta, group.by = "group")
#   cc <- identifyOverExpressedGenes(cc)
#   cc <- identifyOverExpressedInteractions(cc)
#   cc <- computeCommunProb(cc)
#   cc <- computeCommunProbPathway(cc)
#   cc <- aggregateNet(cc, remove.isolate = FALSE)
#   cc <- netAnalysis_computeCentrality(cc, slot.name = "netP")
# }

# ---------------------------------------------------------------------------
# 9. Save outputs
# ---------------------------------------------------------------------------
saveRDS(integrated, file.path(out_dir, "integrated_all_cells.rds"))
saveRDS(myeloid,    file.path(out_dir, "myeloid_cells.rds"))
message("Workflow complete. Outputs in: ", out_dir)

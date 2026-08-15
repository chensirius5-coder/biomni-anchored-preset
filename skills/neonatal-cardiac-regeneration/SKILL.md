---
name: neonatal-cardiac-regeneration
description: Thorp lab 新生(P1) vs 成年心脏巨噬细胞 efferocytosis scRNA-seq 分析工作流（Immunity 2025, GSE241928）：QC、SCT 整合、细胞注释、髓系亚群、module scoring、TXA2 轴、差异表达、CellChat、Monocle3。
whenToUse: 分析 GSE241928 或相关新生/成年小鼠心脏损伤 scRNA/snRNA 数据，比较再生性巨噬细胞与炎症性巨噬细胞状态时。
---

# Neonatal vs Adult Cardiac Macrophage Efferocytosis scRNA-seq Analysis (Thorp Lab Workflow)

## Metadata
**Authors**: Thorplab / Connor W. Lantz (Northwestern University Feinberg School of Medicine)
**Source**: https://github.com/thorplab/Neonatal_Regeneration (Lantz_Regeneration_Manuscript (3).Rmd)
**Paper**: Lantz C, et al. "Early-age efferocytosis directs macrophage arachidonic acid metabolism for tissue regeneration." Immunity 2025;58(2):344-361.e7. PMID: 39938482, DOI: 10.1016/j.immuni.2024.11.018
**Dataset**: GSE241928 (GEO); BioProject PRJNA1010769 (SRA: SRR25810882-888); 10x Genomics 3' v3/v3.1, NovaSeq 6000, CellRanger 4.0, mm10/GRCm38
**Related GEO audit**: see resources/geo_neonatal_adult_mi_datasets.csv (P1 vs adult MI mouse heart scRNA/snRNA datasets)
**Version**: 1.0
**Last Updated**: 2026-08-14
**License**: Public (GitHub)
**Commercial Use**: yes

## Overview
Seurat-based single-cell RNA-seq workflow for comparing the neonatal (P1, regenerative) vs adult (8-week, non-regenerative) cardiac macrophage response to myocardial infarction (MI), covering QC, SCT integration, cell-type annotation, myeloid sub-clustering, module scoring (efferocytosis, arachidonic acid/TXA2), differential expression, CellChat intercellular signaling (GAS/Gas6-MerTK, IGF, SPP1), and Monocle3 trajectories, as implemented by the Thorp lab for the Immunity 2025 paper.

## Data sources
- Primary dataset: **GSE241928** — hearts from P1 and 8-week-old C57BL6/J mice after MI or sham surgery; WT and MerTK-KO (P1); samples: WT_P1_Sh, WT_P1_MI_1, WT_P1_MI_2, WT_Ad_Sh, WT_Ad_MI, MER_Sh, MER_MI. CD45+-enriched, recombined 2:1 with non-CD45+ cells, target ~5,000 cells/sample. NOTE: the exact MI surgical model and harvest timepoint are not stated in GEO metadata — confirm in the paper before interpreting.
- Companion datasets for cross-age integration (see resource CSV): GSE153480/GSE153481 (P1/P8 whole-heart scRNA, LAD ligation, 1/3 dpi, sham), GSE130699 (P1/P8 PCM1+ cardiomyocyte nuclei snRNA), GSE227189 (10-12 wk adult, LAD ligation, 1/7/30 dpi, sham), GSE146285 (8-wk adult MI 3 d + I/R), GSE176092 (adult MI CM snRNA + non-CM scRNA + spatial), GSE163129 (adult CD45+ 1/3/5/7 dpi), GSE95755 (P1 vs P56 FACS-sorted bulk, day 3).

## Workflow

### 1. Load CellRanger matrices and merge
Read each 10x sample with `Read10X` + `CreateSeuratObject(min.features = 100)`; merge with `add.cell.ids` = sample prefix; store `sample` in metadata (regex-match cell barcodes by prefix).

### 2. Quality control
Compute per cell: `log10GenesPerUMI = log10(nFeature)/log10(nCount)`, `mitoRatio` (pattern `^mt-`), `riboRatio` (pattern `^Rp[ls]`). Filter: `nUMI >= 500 & nGene >= 250 & log10GenesPerUMI > 0.80 & mitoRatio < 0.30`; keep genes detected in >= 3 cells. (Paper dataset: 43,118 -> 41,265 cells, 22,165 features.)

### 3. Cell-cycle scoring + SCT integration across samples
`CellCycleScoring` with `cc.genes` (Tirosh et al. 2015), store `CC.Difference = S.Score - G2M.Score`. `SplitObject` by sample; `SCTransform(vst.flavor = "v2", vars.to.regress = c("CC.Difference","mitoRatio"), method = "glmGamPoi")` per sample; `SelectIntegrationFeatures(nfeatures = 4000)`; `PrepSCTIntegration`; `FindIntegrationAnchors(normalization.method = "SCT")`; `IntegrateData`. Then `RunPCA(npcs = 100)` and `RunUMAP(dims = 1:60)`. Always validate batch correction with a UMAP split by sample (batch effects must be mitigated before interpreting age differences).

### 4. Cell-type annotation
- SingleR (reference: `celldex::ImmGenData()`, `labels = label.main`, `de.method = "wilcox"`).
- Seurat graph clustering: `FindNeighbors(dims = 1:60)`; `FindClusters(resolution = c(0.2, 0.4, 0.6, 0.8, 1.0, 1.4))`; choose 0.4 for the full atlas.
- Cluster markers: `FindMarkers(test.use = "MAST", only.pos = TRUE)`, keep `p_val_adj < 0.05 & abs(avg_log2FC) > 0.5`.
- Canonical markers used in the paper: C1qa (macrophage), H2-Ab1 (MHCII), Xcr1 (cDC1), Siglech (pDC), S100a9/Plac8 (neutrophil), Ly6c2 (monocyte), Cd3e/Foxp3/Gata3 (T cells), Ncr1 (NK), Cd19 (B cells), Pecam1 (endothelial), Postn/Col3a1 (fibroblast), Tnnt2 (cardiomyocyte), Tagln (VSMC). Full atlas identities: Neutrophils, Macrophages, Monocytes, Dendritic Cells, B Cells, T Cells, NK/NKT Cells, ILCs, Fibroblasts, Endothelial Cells, Cardiomyocytes, VSMCs, Neurons, Basophils, Dying Cells.

### 5. Myeloid sub-analysis
Subset myeloid cells; repeat SCT + integration + clustering (res 0.4-0.8); identify macrophage subsets. Paper identities: `C1q+ TLF+ Macrophages` (resident/regenerative, TLF = Timd4/Lyve1/Folr2-like), `Prolif. C1q+ Macrophages`, `Arg1+ Macrophages`, `Ccr2+ Macrophages` (monocyte-derived/inflammatory), `Spp1+ Macrophages`, `Ly6chi Monocytes`, `Ly6clo Monocytes`. Compare subset proportions across P1 vs adult, MI vs sham, and MerTK-KO.

### 6. Module scoring (AddModuleScore)
Score curated gene programs per cell, e.g. `AC_Clearance` (apoptotic cell clearance), `Efferocytosis`, `Phagocytosis`, `Endocytosis`, `Collagen_Metabolism`, `Myeloid_Leukocyte_Migration`, `Elastin_Metabolism`, `Response_to_IL1`. Key efferocytosis genes: Mertk, Gas6, Axl, Tyro3, C1qa/b/c, Cd36, Timd4, Lrp1.

### 7. Arachidonic acid / thromboxane (TXA2) axis
Key enzymes: `Pla2g4a`, `Pla2g7`, `Pla2g15`, `Alox5`, `Alox5ap`, `Alox12`, `Alox15`, `Ptgs1`, `Ptgs2`, `Ptges2`, `Ptges3`, `Hpgds`, `Hpgd`, `Tbxas1`, `Prxl2b`, `Ltc4s`. Key receptors (on cardiomyocytes/neighbors): `Tbxa2r`, `Ptger1-4`, `Ptgir`, `Ptgfr`, `Ltb4r1`, `Cysltr1`, `Cmklr1`, `Gpr18`. Biology: neonatal macrophages upregulate TXA2 synthesis after efferocytosis; TXA2 acts on cardiomyocyte Tbxa2r to drive a metabolic/proliferative shift; adult and MerTK-KO macrophages lose this program (Arg1+/Spp1+/Ccr2+ states dominate).

### 8. Differential expression
Use `FindMarkers(test.use = "MAST")` on `cluster_sample` identities. Recommended contrasts: neonate MI vs adult MI per cluster (e.g., `C1q+ Macrophages_WT_P1_MI` vs `C1q+ Macrophages_WT_Ad_MI`), adult sham vs neonate sham, and MerTK-KO vs WT per cluster (sham and MI separately). Visualize with EnhancedVolcano; compare gene-set overlaps with Venn diagrams.

### 9. CellChat cell-cell communication
Build one CellChat object per condition (neonatal sham, neonatal MI, adult sham, adult MI) from the full-atlas Seurat object (CM + myeloid + non-myeloid): `createCellChat`, `identifyOverExpressedGenes`, `identifyOverExpressedInteractions`, `computeCommunProb`, `computeCommunProbPathway`, `aggregateNet(remove.isolate = F)`, `netAnalysis_computeCentrality`; `mergeCellChat` to compare conditions. Focus pathways in the paper: `GAS` (Gas6-Mertk/Axl), `IGF`, `TWEAK`, `SPP1`; `netAnalysis_signalingRole_scatter/network`, `netAnalysis_contribution`, circle plots.

### 10. Trajectory (Monocle3)
Convert myeloid subsets to cds (`as.cell_data_set`), `cluster_cells(cluster_method = "louvain")`, `learn_graph()`, `order_cells(reduction_method = "UMAP", root_pr_nodes = ...)`; compare pseudotime trajectories of WT neonate, WT adult, and MerTK-KO neonate macrophages.

### 11. Cardiomyocyte analysis
Separately cluster CMs; the paper identifies proliferative/regenerative CM states (e.g., `CM4`) expressing `Tbxa2r`; dot/feature plots of eicosanoid receptors; DE of CM4 during regeneration.

## Pitfalls & best practices
- **Age x injury confounding**: P1 hearts are developmentally immature; always compare MI vs sham within each age (four-quadrant design), do not interpret raw P1 vs adult differences as MI-response differences.
- **Batch effects**: SCT integration with anchor-based correction is mandatory when merging P1 and adult samples; validate with split UMAP before biological interpretation.
- **Passenger transcripts**: macrophages engulf apoptotic cells; verify removal of engulfed-cell-derived RNA before interpreting "macrophage" signatures.
- **scRNA vs snRNA**: whole-heart scRNA under-captures cardiomyocytes; use snRNA (e.g., GSE130699) or CM-enriched libraries for CM-focused questions; do not compare scRNA CM proportions across datasets.
- **Chemistry/platform mismatch**: cross-dataset integration (e.g., GSE153480 10x v2/NextSeq500 vs GSE227189 10x v3/NovaSeq6000) requires strong batch correction (Harmony/scVI) and marker-based validation; never attribute chemistry differences to age biology.
- **Replicates**: many GEO samples are n=1 libraries; report this limitation and validate key findings across datasets.

## Required R packages
Seurat, SeuratObject, sctransform, glmGamPoi, SingleR, celldex, scran, scater, monocle3, dyno, SeuratWrappers, CellChat, EnhancedVolcano, ComplexHeatmap, cowplot, tidyverse, Matrix, umap. Set `options(future.globals.maxSize=...)` for large objects. A parameterized R script is provided at resources/thorplab_neonatal_regeneration_workflow.R.

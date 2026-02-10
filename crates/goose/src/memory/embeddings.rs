//! Embedding Providers for the Memory System
//!
//! Provides a trait abstraction over embedding generation with two implementations:
//! - `HashEmbeddingProvider`: Deterministic hash-based fake embeddings (fast, no model needed)
//! - `CandleEmbeddingProvider`: Real 384-dim sentence embeddings using all-MiniLM-L6-v2 via Candle
//!
//! The system gracefully falls back to hash embeddings if the Candle model fails to load.

use super::MemoryResult;
use async_trait::async_trait;
use std::sync::Arc;
use tracing::{debug, info, warn};

// ─── Trait ───────────────────────────────────────────────────────────────────

/// Abstraction over embedding generation.
/// Implementations must be Send + Sync for use in async agent loops.
#[async_trait]
pub trait EmbeddingProvider: Send + Sync + std::fmt::Debug {
    /// Generate an embedding vector for a single text input.
    async fn embed(&self, text: &str) -> MemoryResult<Vec<f32>>;

    /// Batch-embed multiple texts. Default implementation calls `embed` sequentially.
    async fn embed_batch(&self, texts: &[&str]) -> MemoryResult<Vec<Vec<f32>>> {
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.embed(text).await?);
        }
        Ok(results)
    }

    /// The dimensionality of the output vectors.
    fn dimension(&self) -> usize;

    /// Human-readable provider name (for logging / diagnostics).
    fn name(&self) -> &str;
}

// ─── Hash-Based Fallback ─────────────────────────────────────────────────────

/// Deterministic hash-based embedding provider.
/// Produces consistent but semantically meaningless vectors.
/// Used as a fallback when Candle model loading fails.
#[derive(Debug, Clone)]
pub struct HashEmbeddingProvider {
    dimension: usize,
}

impl HashEmbeddingProvider {
    pub fn new(dimension: usize) -> Self {
        Self { dimension }
    }
}

#[async_trait]
impl EmbeddingProvider for HashEmbeddingProvider {
    async fn embed(&self, text: &str) -> MemoryResult<Vec<f32>> {
        let mut embedding = vec![0.0f32; self.dimension];
        let text_lower = text.to_lowercase();
        let words: Vec<&str> = text_lower.split_whitespace().collect();

        for (i, word) in words.iter().enumerate() {
            let hash = simple_hash(word);
            let idx1 = (hash % self.dimension as u64) as usize;
            let idx2 = ((hash / 7) % self.dimension as u64) as usize;
            let idx3 = ((hash / 13) % self.dimension as u64) as usize;

            let position_weight = 1.0 / (1.0 + i as f32 * 0.1);
            let length_factor = (word.len() as f32).sqrt() / 3.0;

            embedding[idx1] += position_weight * length_factor;
            embedding[idx2] += position_weight * 0.5;
            embedding[idx3] -= position_weight * 0.3;
        }

        normalize(&mut embedding);
        Ok(embedding)
    }

    fn dimension(&self) -> usize {
        self.dimension
    }

    fn name(&self) -> &str {
        "hash"
    }
}

// ─── Candle Sentence-Transformer ─────────────────────────────────────────────

/// Real sentence-transformer embedding provider using Candle.
/// Loads `sentence-transformers/all-MiniLM-L6-v2` (384-dim) via hf-hub.
/// Mean-pools token embeddings and L2-normalizes the result.
pub struct CandleEmbeddingProvider {
    model: candle_transformers::models::bert::BertModel,
    tokenizer: tokenizers::Tokenizer,
    device: candle_core::Device,
    dimension: usize,
}

impl std::fmt::Debug for CandleEmbeddingProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CandleEmbeddingProvider")
            .field("dimension", &self.dimension)
            .field("device", &format!("{:?}", self.device))
            .finish_non_exhaustive()
    }
}

impl CandleEmbeddingProvider {
    /// Attempt to create a CandleEmbeddingProvider.
    /// Downloads model weights from HuggingFace Hub if not cached locally.
    /// Returns Err if model loading fails (caller should fall back to HashEmbeddingProvider).
    pub async fn try_new() -> anyhow::Result<Self> {
        use candle_core::Device;

        info!("Loading sentence-transformer model (all-MiniLM-L6-v2)...");

        // Select device: CUDA > Metal > CPU
        let device = if let Ok(d) = Device::new_cuda(0) {
            info!("Using CUDA device for embeddings");
            d
        } else if let Ok(d) = Device::new_metal(0) {
            info!("Using Metal device for embeddings");
            d
        } else {
            debug!("Using CPU device for embeddings");
            Device::Cpu
        };

        // Download model files from HuggingFace Hub (cached locally)
        let repo_id = "sentence-transformers/all-MiniLM-L6-v2";
        let api = hf_hub::api::tokio::Api::new()?;
        let repo = api.model(repo_id.to_string());

        // Download in parallel using tokio::join
        let (config_path, tokenizer_path, weights_path) = tokio::try_join!(
            async { repo.get("config.json").await },
            async { repo.get("tokenizer.json").await },
            async { repo.get("model.safetensors").await },
        )?;

        info!(
            "Model files ready: config={}, tokenizer={}, weights={}",
            config_path.display(),
            tokenizer_path.display(),
            weights_path.display(),
        );

        // Load config
        let config_str = std::fs::read_to_string(&config_path)?;
        let config: candle_transformers::models::bert::Config =
            serde_json::from_str(&config_str)?;
        let hidden_size = config.hidden_size;

        // Load tokenizer
        let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        // Load weights
        let vb = unsafe {
            candle_nn::VarBuilder::from_mmaped_safetensors(
                &[weights_path],
                candle_core::DType::F32,
                &device,
            )?
        };

        // Build BERT model
        let model = candle_transformers::models::bert::BertModel::load(vb, &config)?;

        info!(
            "Sentence-transformer loaded successfully (dim={})",
            hidden_size
        );

        Ok(Self {
            model,
            tokenizer,
            device,
            dimension: hidden_size,
        })
    }

    /// Tokenize, forward, mean-pool, and normalize.
    fn encode_sync(&self, text: &str) -> MemoryResult<Vec<f32>> {
        use candle_core::Tensor;

        // Tokenize
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| super::MemoryError::embedding(format!("Tokenization failed: {}", e)))?;

        let token_ids = encoding.get_ids().to_vec();
        let attention_mask = encoding.get_attention_mask().to_vec();

        let token_ids_tensor = Tensor::new(
            vec![token_ids.iter().map(|&x| x as i64).collect::<Vec<_>>()],
            &self.device,
        )
        .map_err(|e| super::MemoryError::embedding(format!("Tensor creation failed: {}", e)))?;

        let attention_mask_tensor = Tensor::new(
            vec![attention_mask
                .iter()
                .map(|&x| x as i64)
                .collect::<Vec<_>>()],
            &self.device,
        )
        .map_err(|e| super::MemoryError::embedding(format!("Mask tensor failed: {}", e)))?;

        let token_type_ids = Tensor::zeros_like(&token_ids_tensor)
            .map_err(|e| super::MemoryError::embedding(format!("Token type IDs failed: {}", e)))?;

        // Forward pass
        let output = self
            .model
            .forward(&token_ids_tensor, &token_type_ids, Some(&attention_mask_tensor))
            .map_err(|e| super::MemoryError::embedding(format!("Model forward failed: {}", e)))?;

        // Mean pooling over non-masked tokens
        // output shape: [1, seq_len, hidden_size]
        let mask_expanded = attention_mask_tensor
            .unsqueeze(2)
            .and_then(|m| m.to_dtype(candle_core::DType::F32))
            .and_then(|m| m.broadcast_as(output.shape()))
            .map_err(|e| super::MemoryError::embedding(format!("Mask expansion failed: {}", e)))?;

        let masked = output
            .mul(&mask_expanded)
            .map_err(|e| super::MemoryError::embedding(format!("Masking failed: {}", e)))?;

        let summed = masked
            .sum(1)
            .map_err(|e| super::MemoryError::embedding(format!("Sum failed: {}", e)))?;

        let mask_sum = mask_expanded
            .sum(1)
            .and_then(|s| s.clamp(1e-9, f64::MAX))
            .map_err(|e| {
                super::MemoryError::embedding(format!("Mask sum failed: {}", e))
            })?;

        let mean_pooled = summed
            .div(&mask_sum)
            .map_err(|e| super::MemoryError::embedding(format!("Mean pool failed: {}", e)))?;

        // Squeeze batch dimension and convert to Vec<f32>
        let embedding_tensor = mean_pooled.squeeze(0).map_err(|e| {
            super::MemoryError::embedding(format!("Squeeze failed: {}", e))
        })?;

        let mut embedding: Vec<f32> = embedding_tensor.to_vec1().map_err(|e| {
            super::MemoryError::embedding(format!("Tensor to vec failed: {}", e))
        })?;

        // L2 normalize
        normalize(&mut embedding);

        Ok(embedding)
    }
}

#[async_trait]
impl EmbeddingProvider for CandleEmbeddingProvider {
    async fn embed(&self, text: &str) -> MemoryResult<Vec<f32>> {
        // Candle is synchronous — run on blocking thread pool to avoid blocking async runtime
        let text = text.to_string();
        // SAFETY: We know self lives as long as the Arc that wraps it, but we can't
        // send &self across threads. Instead, do the work inline since candle ops
        // are CPU-bound but fast enough for single texts.
        self.encode_sync(&text)
    }

    async fn embed_batch(&self, texts: &[&str]) -> MemoryResult<Vec<Vec<f32>>> {
        // For batch, process sequentially (candle BERT doesn't easily batch different lengths)
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.encode_sync(text)?);
        }
        Ok(results)
    }

    fn dimension(&self) -> usize {
        self.dimension
    }

    fn name(&self) -> &str {
        "candle-minilm"
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/// Create the best available embedding provider.
/// Tries CandleEmbeddingProvider first, falls back to HashEmbeddingProvider.
pub async fn create_embedding_provider(dimension: usize) -> Arc<dyn EmbeddingProvider> {
    match CandleEmbeddingProvider::try_new().await {
        Ok(provider) => {
            info!(
                "Using Candle sentence-transformer embeddings (dim={})",
                provider.dimension()
            );
            Arc::new(provider)
        }
        Err(e) => {
            warn!(
                "Candle embedding model unavailable ({}), using hash-based fallback. \
                 Semantic search will work but with reduced quality.",
                e
            );
            Arc::new(HashEmbeddingProvider::new(dimension))
        }
    }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/// Simple deterministic hash function for hash-based embeddings.
fn simple_hash(s: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in s.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }
    hash
}

/// L2-normalize a vector in place (makes it a unit vector).
fn normalize(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_hash_embedding_dimension() {
        let provider = HashEmbeddingProvider::new(384);
        let emb = provider.embed("hello world").await.unwrap();
        assert_eq!(emb.len(), 384);
    }

    #[tokio::test]
    async fn test_hash_embedding_deterministic() {
        let provider = HashEmbeddingProvider::new(128);
        let emb1 = provider.embed("test content").await.unwrap();
        let emb2 = provider.embed("test content").await.unwrap();
        assert_eq!(emb1, emb2);
    }

    #[tokio::test]
    async fn test_hash_embedding_normalized() {
        let provider = HashEmbeddingProvider::new(256);
        let emb = provider.embed("some text to embed").await.unwrap();
        let norm: f32 = emb.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.01, "Expected unit vector, got norm {}", norm);
    }

    #[tokio::test]
    async fn test_hash_embedding_different_texts() {
        let provider = HashEmbeddingProvider::new(128);
        let emb1 = provider.embed("hello world").await.unwrap();
        let emb2 = provider.embed("goodbye universe").await.unwrap();
        assert_ne!(emb1, emb2);
    }

    #[tokio::test]
    async fn test_hash_batch_embedding() {
        let provider = HashEmbeddingProvider::new(64);
        let texts = vec!["first", "second", "third"];
        let results = provider.embed_batch(&texts).await.unwrap();
        assert_eq!(results.len(), 3);
        for emb in &results {
            assert_eq!(emb.len(), 64);
        }
    }

    #[tokio::test]
    async fn test_hash_provider_name() {
        let provider = HashEmbeddingProvider::new(128);
        assert_eq!(provider.name(), "hash");
    }

    #[tokio::test]
    async fn test_hash_empty_text() {
        let provider = HashEmbeddingProvider::new(128);
        let emb = provider.embed("").await.unwrap();
        assert_eq!(emb.len(), 128);
        // All zeros normalized should still be zeros (norm=0 guard)
    }

    #[test]
    fn test_simple_hash_deterministic() {
        assert_eq!(simple_hash("hello"), simple_hash("hello"));
        assert_ne!(simple_hash("hello"), simple_hash("world"));
    }

    #[test]
    fn test_normalize_unit_vector() {
        let mut v = vec![3.0, 4.0];
        normalize(&mut v);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_normalize_zero_vector() {
        let mut v = vec![0.0, 0.0, 0.0];
        normalize(&mut v);
        // Should remain zero (no division by zero)
        assert!(v.iter().all(|&x| x == 0.0));
    }
}

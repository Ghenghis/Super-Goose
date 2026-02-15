# syntax=docker/dockerfile:1.4
# Super-Goose — AI Agent Platform Docker Image
# Multi-stage build for minimal final image size
# Builds both goose CLI and goosed server binaries

# Build stage — base image provides rustup; rust-toolchain.toml selects version
FROM rust:1.84-bookworm AS builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libssl-dev \
    libdbus-1-dev \
    protobuf-compiler \
    libprotobuf-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /build

# Copy rust-toolchain.toml first so rustup installs the correct version
# before downloading all crate dependencies
COPY rust-toolchain.toml .
RUN rustup show

# Copy only Cargo manifests first for dependency caching.
# This layer is only invalidated when dependencies change, not when source code changes.
COPY Cargo.toml Cargo.lock ./
COPY crates/goose/Cargo.toml crates/goose/Cargo.toml
COPY crates/goose-cli/Cargo.toml crates/goose-cli/Cargo.toml
COPY crates/goose-server/Cargo.toml crates/goose-server/Cargo.toml

# Create stub source files so cargo can resolve the dependency tree
RUN mkdir -p crates/goose/src crates/goose-cli/src crates/goose-server/src && \
    echo "fn main() {}" > crates/goose-cli/src/main.rs && \
    echo "fn main() {}" > crates/goose-server/src/main.rs && \
    touch crates/goose/src/lib.rs

# Pre-build dependencies (cached unless Cargo.toml/Cargo.lock change)
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
RUN cargo build --release --package goose-cli --package goose-server 2>/dev/null || true

# Now copy full source code
COPY . .

# Touch source files to ensure they're newer than the stub files
RUN find crates -name "*.rs" -exec touch {} +

# Build release binaries with optimizations
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=z
ENV CARGO_PROFILE_RELEASE_STRIP=true
RUN cargo build --release --package goose-cli --package goose-server

# Runtime stage - minimal Debian
FROM debian:bookworm-slim

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libdbus-1-3 \
    libxcb1 \
    curl \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder
COPY --from=builder /build/target/release/goose /usr/local/bin/goose
COPY --from=builder /build/target/release/goosed /usr/local/bin/goosed

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash goose && \
    mkdir -p /home/goose/.config/goose && \
    chown -R goose:goose /home/goose

# Set up environment
ENV PATH="/usr/local/bin:${PATH}"
ENV HOME="/home/goose"

# Expose goosed server port
EXPOSE 3284

# Health check for goosed server (uses /status which is auth-exempt)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3284/status || exit 1

# Switch to non-root user
USER goose
WORKDIR /home/goose

# Default to goose CLI
ENTRYPOINT ["/usr/local/bin/goose"]
CMD ["--help"]

# Labels for metadata
LABEL org.opencontainers.image.title="Super-Goose"
LABEL org.opencontainers.image.description="Super-Goose — AI Agent Platform with 6 agent cores and OTA self-improvement"
LABEL org.opencontainers.image.vendor="Ghenghis"
LABEL org.opencontainers.image.source="https://github.com/Ghenghis/Super-Goose"
LABEL org.opencontainers.image.licenses="Apache-2.0"

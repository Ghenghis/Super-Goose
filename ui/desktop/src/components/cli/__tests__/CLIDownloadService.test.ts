import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectPlatform,
  getInstallPath,
  getDownloadUrl,
  getLatestVersion,
  type PlatformInfo,
} from '../CLIDownloadService';

describe('CLIDownloadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  describe('detectPlatform', () => {
    it('should return a PlatformInfo object', () => {
      const platform = detectPlatform();
      expect(platform).toHaveProperty('os');
      expect(platform).toHaveProperty('arch');
      expect(platform).toHaveProperty('assetName');
      expect(platform).toHaveProperty('installDir');
      expect(platform).toHaveProperty('binaryName');
    });

    it('should return a valid os value', () => {
      const platform = detectPlatform();
      expect(['windows', 'macos', 'linux']).toContain(platform.os);
    });

    it('should return a valid arch value', () => {
      const platform = detectPlatform();
      expect(['x64', 'arm64']).toContain(platform.arch);
    });

    it('should return a non-empty assetName', () => {
      const platform = detectPlatform();
      expect(platform.assetName).toBeTruthy();
      expect(platform.assetName.length).toBeGreaterThan(0);
    });

    it('should return a non-empty binaryName', () => {
      const platform = detectPlatform();
      expect(platform.binaryName).toBeTruthy();
    });
  });

  describe('getInstallPath', () => {
    it('should return path with backslash for windows', () => {
      const platform: PlatformInfo = {
        os: 'windows',
        arch: 'x64',
        assetName: 'goose-x86_64-pc-windows-msvc.zip',
        installDir: 'C:\\Users\\Admin\\.goose\\bin',
        binaryName: 'goose.exe',
      };
      const result = getInstallPath(platform);
      expect(result).toBe('C:\\Users\\Admin\\.goose\\bin\\goose.exe');
    });

    it('should return path with forward slash for macos', () => {
      const platform: PlatformInfo = {
        os: 'macos',
        arch: 'arm64',
        assetName: 'goose-aarch64-apple-darwin.tar.bz2',
        installDir: '/Users/admin/.goose/bin',
        binaryName: 'goose',
      };
      const result = getInstallPath(platform);
      expect(result).toBe('/Users/admin/.goose/bin/goose');
    });

    it('should return path with forward slash for linux', () => {
      const platform: PlatformInfo = {
        os: 'linux',
        arch: 'x64',
        assetName: 'goose-x86_64-unknown-linux-gnu.tar.bz2',
        installDir: '/home/user/.goose/bin',
        binaryName: 'goose',
      };
      const result = getInstallPath(platform);
      expect(result).toBe('/home/user/.goose/bin/goose');
    });
  });

  describe('getDownloadUrl', () => {
    it('should return correct URL for windows x64', () => {
      const platform: PlatformInfo = {
        os: 'windows',
        arch: 'x64',
        assetName: 'goose-x86_64-pc-windows-msvc.zip',
        installDir: 'C:\\Users\\Admin\\.goose\\bin',
        binaryName: 'goose.exe',
      };
      const url = getDownloadUrl('v1.24.05', platform);
      expect(url).toBe(
        'https://github.com/Ghenghis/Super-Goose/releases/download/v1.24.05/goose-x86_64-pc-windows-msvc.zip'
      );
    });

    it('should return correct URL for macos arm64', () => {
      const platform: PlatformInfo = {
        os: 'macos',
        arch: 'arm64',
        assetName: 'goose-aarch64-apple-darwin.tar.bz2',
        installDir: '/Users/admin/.goose/bin',
        binaryName: 'goose',
      };
      const url = getDownloadUrl('v1.24.05', platform);
      expect(url).toBe(
        'https://github.com/Ghenghis/Super-Goose/releases/download/v1.24.05/goose-aarch64-apple-darwin.tar.bz2'
      );
    });

    it('should return correct URL for linux x64', () => {
      const platform: PlatformInfo = {
        os: 'linux',
        arch: 'x64',
        assetName: 'goose-x86_64-unknown-linux-gnu.tar.bz2',
        installDir: '/home/user/.goose/bin',
        binaryName: 'goose',
      };
      const url = getDownloadUrl('v2.0.0', platform);
      expect(url).toBe(
        'https://github.com/Ghenghis/Super-Goose/releases/download/v2.0.0/goose-x86_64-unknown-linux-gnu.tar.bz2'
      );
    });

    it('should include version tag in URL path', () => {
      const platform: PlatformInfo = {
        os: 'linux',
        arch: 'arm64',
        assetName: 'goose-aarch64-unknown-linux-gnu.tar.bz2',
        installDir: '/home/user/.goose/bin',
        binaryName: 'goose',
      };
      const url = getDownloadUrl('v3.0.0-rc1', platform);
      expect(url).toContain('/v3.0.0-rc1/');
    });
  });

  describe('getLatestVersion', () => {
    it('should fetch latest version from GitHub API when fetch succeeds', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tag_name: 'v1.24.05' }),
      });
      global.fetch = mockFetch;

      const version = await getLatestVersion();
      expect(version).toBe('v1.24.05');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should return "unknown" when fetch fails', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const version = await getLatestVersion();
      expect(version).toBe('unknown');
    });

    it('should return "unknown" when API returns non-ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      const version = await getLatestVersion();
      expect(version).toBe('unknown');
    });
  });
});

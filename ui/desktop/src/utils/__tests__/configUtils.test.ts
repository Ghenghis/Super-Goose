import { describe, it, expect } from 'vitest';
import { configLabels, providerPrefixes, getUiNames } from '../configUtils';

describe('configUtils', () => {
  describe('configLabels', () => {
    it('is a non-empty record', () => {
      expect(Object.keys(configLabels).length).toBeGreaterThan(0);
    });

    it('maps GOOSE_PROVIDER to "Provider"', () => {
      expect(configLabels['GOOSE_PROVIDER']).toBe('Provider');
    });

    it('maps OPENAI_API_KEY to "OpenAI API Key"', () => {
      expect(configLabels['OPENAI_API_KEY']).toBe('OpenAI API Key');
    });

    it('maps ANTHROPIC_API_KEY to "Anthropic API Key"', () => {
      expect(configLabels['ANTHROPIC_API_KEY']).toBe('Anthropic API Key');
    });
  });

  describe('providerPrefixes', () => {
    it('maps openai to OPENAI_ prefix', () => {
      expect(providerPrefixes['openai']).toEqual(['OPENAI_']);
    });

    it('maps anthropic to ANTHROPIC_ prefix', () => {
      expect(providerPrefixes['anthropic']).toEqual(['ANTHROPIC_']);
    });

    it('maps azure_openai to AZURE_ prefix', () => {
      expect(providerPrefixes['azure_openai']).toEqual(['AZURE_']);
    });

    it('contains entries for common providers', () => {
      expect(providerPrefixes).toHaveProperty('google');
      expect(providerPrefixes).toHaveProperty('ollama');
      expect(providerPrefixes).toHaveProperty('groq');
    });
  });

  describe('getUiNames', () => {
    it('returns label from configLabels when key exists', () => {
      expect(getUiNames('GOOSE_PROVIDER')).toBe('Provider');
      expect(getUiNames('GOOSE_MODEL')).toBe('Model');
    });

    it('converts unknown key to title case with spaces', () => {
      expect(getUiNames('SOME_UNKNOWN_KEY')).toBe('Some Unknown Key');
    });

    it('handles single-word keys', () => {
      expect(getUiNames('TEST')).toBe('Test');
    });

    it('handles empty string', () => {
      // Empty string split by _ gives [''], which results in empty string
      expect(getUiNames('')).toBe('');
    });

    it('returns mapped label for security settings', () => {
      expect(getUiNames('SECURITY_PROMPT_ENABLED')).toBe('Prompt Injection Detection Enabled');
    });
  });
});

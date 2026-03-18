import { validateFile } from '@/lib/validation';
import { ValidationError } from '@/lib/errors';

describe('File Validation', () => {
  describe('validateFile', () => {
    it('should accept .pdf files', () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      expect(() => validateFile(file)).not.toThrow();
    });

    it('should accept .docx files', () => {
      const file = new File(['test'], 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      expect(() => validateFile(file)).not.toThrow();
    });

    it('should accept .txt files', () => {
      const file = new File(['test'], 'document.txt', { type: 'text/plain' });
      expect(() => validateFile(file)).not.toThrow();
    });

    it('should accept .md files', () => {
      const file = new File(['# Test'], 'document.md', { type: 'text/markdown' });
      expect(() => validateFile(file)).not.toThrow();
    });

    it('should reject files exceeding 10MB', () => {
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf',
      });
      expect(() => validateFile(largeFile)).toThrow(ValidationError);
      expect(() => validateFile(largeFile)).toThrow('10MB');
    });

    it('should reject unsupported file types', () => {
      const file = new File(['test'], 'document.json', { type: 'application/json' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Unsupported file type');
    });

    it('should reject executable files (.exe)', () => {
      const file = new File(['malicious'], 'malware.exe', { type: 'application/x-msdownload' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Executable files are not allowed');
    });

    it('should reject shell scripts (.sh)', () => {
      const file = new File(['#!/bin/bash'], 'script.sh', { type: 'application/x-sh' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Executable files are not allowed');
    });

    it('should reject batch files (.bat)', () => {
      const file = new File(['@echo off'], 'script.bat', { type: 'application/x-bat' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Executable files are not allowed');
    });

    it('should reject command files (.cmd)', () => {
      const file = new File(['@echo off'], 'script.cmd', { type: 'application/x-cmd' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Executable files are not allowed');
    });

    it('should reject JAR files (.jar)', () => {
      const file = new File(['test'], 'app.jar', { type: 'application/java-archive' });
      expect(() => validateFile(file)).toThrow(ValidationError);
      expect(() => validateFile(file)).toThrow('Executable files are not allowed');
    });

    it('should handle files at exactly 10MB', () => {
      const file = new File([new ArrayBuffer(10 * 1024 * 1024)], 'exact.pdf', {
        type: 'application/pdf',
      });
      expect(() => validateFile(file)).not.toThrow();
    });

    it('should handle case-insensitive file extensions', () => {
      const file1 = new File(['test'], 'document.PDF', { type: 'application/pdf' });
      const file2 = new File(['test'], 'document.Pdf', { type: 'application/pdf' });
      const file3 = new File(['test'], 'malware.EXE', { type: 'application/x-msdownload' });

      expect(() => validateFile(file1)).not.toThrow();
      expect(() => validateFile(file2)).not.toThrow();
      expect(() => validateFile(file3)).toThrow('Executable files are not allowed');
    });
  });
});

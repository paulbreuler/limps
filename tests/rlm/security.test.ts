/**
 * Tests for security.ts - Security sandbox validation
 * Feature #6: Security Sandbox
 * Test IDs: sec-block-fs, sec-block-net, sec-block-eval
 */

import { describe, it, expect } from 'vitest';
import { validateCode, SecurityError, BLOCKED_APIS } from '../../src/rlm/security.js';

describe('security.ts', () => {
  describe('BLOCKED_APIS', () => {
    it('should export BLOCKED_APIS array', () => {
      expect(BLOCKED_APIS).toBeDefined();
      expect(Array.isArray(BLOCKED_APIS)).toBe(true);
      expect(BLOCKED_APIS.length).toBeGreaterThan(0);
    });

    it('should include all dangerous APIs', () => {
      const expectedApis = [
        'require',
        'import',
        'eval',
        'Function',
        'process',
        'global',
        'globalThis',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'setTimeout',
        'setInterval',
        'setImmediate',
        'Buffer',
        'ArrayBuffer.transfer',
        '__proto__',
        'constructor.constructor',
      ];

      for (const api of expectedApis) {
        expect(BLOCKED_APIS).toContain(api);
      }
    });
  });

  describe('SecurityError', () => {
    it('should have violation property', () => {
      const error = new SecurityError('require', 'Prohibited module access');
      expect(error.violation).toBe('require');
      expect(error.message).toBe('Prohibited module access');
      expect(error instanceof Error).toBe(true);
    });

    it('should be instanceof SecurityError', () => {
      const error = new SecurityError('eval', 'Dynamic code execution');
      expect(error instanceof SecurityError).toBe(true);
      expect(error.name).toBe('SecurityError');
    });
  });

  describe('validateCode', () => {
    // Test ID: sec-block-fs
    describe('blocks require()', () => {
      it('should throw SecurityError for require()', () => {
        expect(() => validateCode("require('fs')")).toThrow(SecurityError);
        expect(() => validateCode("require('fs')")).toThrow(/Prohibited module access/);
      });

      it('should throw SecurityError for require with different quotes', () => {
        expect(() => validateCode('require("child_process")')).toThrow(SecurityError);
        expect(() => validateCode('require(`path`)')).toThrow(SecurityError);
      });

      it('should throw SecurityError for require without parentheses', () => {
        expect(() => validateCode('const r = require')).toThrow(SecurityError);
      });
    });

    describe('blocks import()', () => {
      it('should throw SecurityError for dynamic import', () => {
        expect(() => validateCode("import('fs')")).toThrow(SecurityError);
        expect(() => validateCode("import('fs')")).toThrow(/Dynamic import not allowed/);
      });

      it('should throw SecurityError for import statement', () => {
        expect(() => validateCode("import fs from 'fs'")).toThrow(SecurityError);
      });
    });

    // Test ID: sec-block-eval
    describe('blocks eval()', () => {
      it('should throw SecurityError for eval()', () => {
        expect(() => validateCode("eval('malicious')")).toThrow(SecurityError);
        expect(() => validateCode("eval('malicious')")).toThrow(/Dynamic code execution/);
      });

      it('should throw SecurityError for eval without parentheses', () => {
        expect(() => validateCode('const e = eval')).toThrow(SecurityError);
      });
    });

    // Test ID: sec-block-net
    describe('blocks fetch()', () => {
      it('should throw SecurityError for fetch()', () => {
        expect(() => validateCode("fetch('https://evil.com')")).toThrow(SecurityError);
        expect(() => validateCode("fetch('https://evil.com')")).toThrow(
          /Network access not allowed/
        );
      });
    });

    describe('blocks process access', () => {
      it('should throw SecurityError for process.exit()', () => {
        expect(() => validateCode('process.exit(1)')).toThrow(SecurityError);
        expect(() => validateCode('process.exit(1)')).toThrow(/Process access not allowed/);
      });

      it('should throw SecurityError for process.env', () => {
        expect(() => validateCode('process.env.SECRET')).toThrow(SecurityError);
      });

      it('should throw SecurityError for process reference', () => {
        expect(() => validateCode('const p = process')).toThrow(SecurityError);
      });
    });

    describe('blocks __proto__ manipulation', () => {
      it('should throw SecurityError for __proto__ access', () => {
        expect(() => validateCode('obj.__proto__ = {}')).toThrow(SecurityError);
        expect(() => validateCode('obj.__proto__ = {}')).toThrow(/Prototype pollution/);
      });

      it('should throw SecurityError for __proto__ read', () => {
        expect(() => validateCode('const p = obj.__proto__')).toThrow(SecurityError);
      });
    });

    describe('blocks constructor.constructor bypass', () => {
      it('should throw SecurityError for constructor.constructor', () => {
        expect(() => validateCode("({}).constructor.constructor('return this')()")).toThrow(
          SecurityError
        );
        expect(() => validateCode("({}).constructor.constructor('return this')()")).toThrow(
          /Prototype pollution/
        );
      });

      it('should throw SecurityError for chained constructor access', () => {
        expect(() => validateCode('[].constructor.constructor')).toThrow(SecurityError);
      });
    });

    describe('blocks Function constructor', () => {
      it('should throw SecurityError for new Function()', () => {
        expect(() => validateCode("new Function('return this')")).toThrow(SecurityError);
      });

      it('should throw SecurityError for Function reference', () => {
        expect(() => validateCode('const F = Function')).toThrow(SecurityError);
      });
    });

    describe('blocks global access', () => {
      it('should throw SecurityError for global', () => {
        expect(() => validateCode('global.process')).toThrow(SecurityError);
      });

      it('should throw SecurityError for globalThis', () => {
        expect(() => validateCode('globalThis.process')).toThrow(SecurityError);
      });
    });

    describe('blocks timer functions', () => {
      it('should throw SecurityError for setTimeout', () => {
        expect(() => validateCode('setTimeout(() => {}, 1000)')).toThrow(SecurityError);
      });

      it('should throw SecurityError for setInterval', () => {
        expect(() => validateCode('setInterval(() => {}, 1000)')).toThrow(SecurityError);
      });

      it('should throw SecurityError for setImmediate', () => {
        expect(() => validateCode('setImmediate(() => {})')).toThrow(SecurityError);
      });
    });

    describe('blocks Buffer and ArrayBuffer', () => {
      it('should throw SecurityError for Buffer', () => {
        expect(() => validateCode("Buffer.from('test')")).toThrow(SecurityError);
      });

      it('should throw SecurityError for ArrayBuffer.transfer', () => {
        expect(() => validateCode('ArrayBuffer.transfer(buf, 10)')).toThrow(SecurityError);
      });
    });

    describe('blocks network objects', () => {
      it('should throw SecurityError for XMLHttpRequest', () => {
        expect(() => validateCode('new XMLHttpRequest()')).toThrow(SecurityError);
      });

      it('should throw SecurityError for WebSocket', () => {
        expect(() => validateCode("new WebSocket('ws://evil.com')")).toThrow(SecurityError);
      });
    });

    describe('allows safe builtins', () => {
      it('should allow String methods', () => {
        expect(() => validateCode("'hello'.toUpperCase()")).not.toThrow();
        expect(() => validateCode("'hello'.split('')")).not.toThrow();
        expect(() => validateCode('String.fromCharCode(65)')).not.toThrow();
      });

      it('should allow Array methods', () => {
        expect(() => validateCode('[1,2,3].map(x => x * 2)')).not.toThrow();
        expect(() => validateCode('[1,2,3].filter(x => x > 1)')).not.toThrow();
        expect(() => validateCode('[1,2,3].reduce((a,b) => a + b, 0)')).not.toThrow();
      });

      it('should allow Object methods', () => {
        expect(() => validateCode('Object.keys({a: 1})')).not.toThrow();
        expect(() => validateCode('Object.values({a: 1})')).not.toThrow();
        expect(() => validateCode('Object.entries({a: 1})')).not.toThrow();
      });

      it('should allow JSON methods', () => {
        expect(() => validateCode('JSON.stringify({a: 1})')).not.toThrow();
        expect(() => validateCode('JSON.parse(\'{"a":1}\')')).not.toThrow();
      });

      it('should allow RegExp', () => {
        expect(() => validateCode("/test/.test('testing')")).not.toThrow();
        expect(() => validateCode("new RegExp('test').test('testing')")).not.toThrow();
      });

      it('should allow Math', () => {
        expect(() => validateCode('Math.max(1, 2, 3)')).not.toThrow();
        expect(() => validateCode('Math.floor(3.14)')).not.toThrow();
        expect(() => validateCode('Math.random()')).not.toThrow();
      });

      it('should allow arrow functions', () => {
        expect(() => validateCode('const fn = x => x * 2')).not.toThrow();
        expect(() => validateCode('const fn = (a, b) => a + b')).not.toThrow();
      });

      it('should allow regular functions', () => {
        expect(() => validateCode('function add(a, b) { return a + b; }')).not.toThrow();
      });

      it('should allow doc operations (typical RLM use case)', () => {
        expect(() =>
          validateCode("doc.content.split('\\n').filter(l => l.includes('§'))")
        ).not.toThrow();
        expect(() => validateCode('doc.content.slice(0, 100)')).not.toThrow();
        expect(() => validateCode('docs.map(d => d.path)')).not.toThrow();
      });
    });

    describe('validates code before execution', () => {
      it('should not throw for empty code', () => {
        expect(() => validateCode('')).not.toThrow();
      });

      it('should not throw for whitespace only', () => {
        expect(() => validateCode('   \n\t  ')).not.toThrow();
      });

      it('should catch multiple violations', () => {
        // Should throw on first violation found
        const code = "require('fs'); eval('bad'); process.exit(1);";
        expect(() => validateCode(code)).toThrow(SecurityError);
      });
    });
  });
});

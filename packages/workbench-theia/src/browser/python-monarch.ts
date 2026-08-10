import * as monaco from '@theia/monaco-editor-core'

const PYTHON_KEYWORDS = [
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'exec',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield'
]

const PYTHON_BUILTINS = [
  'False',
  'None',
  'True',
  '__import__',
  'abs',
  'all',
  'any',
  'bin',
  'bool',
  'breakpoint',
  'bytearray',
  'bytes',
  'callable',
  'chr',
  'classmethod',
  'compile',
  'complex',
  'delattr',
  'dict',
  'dir',
  'divmod',
  'enumerate',
  'eval',
  'exec',
  'filter',
  'float',
  'format',
  'frozenset',
  'getattr',
  'globals',
  'hasattr',
  'hash',
  'help',
  'hex',
  'id',
  'input',
  'int',
  'isinstance',
  'issubclass',
  'iter',
  'len',
  'list',
  'locals',
  'map',
  'max',
  'memoryview',
  'min',
  'next',
  'object',
  'oct',
  'open',
  'ord',
  'pow',
  'print',
  'property',
  'range',
  'repr',
  'reversed',
  'round',
  'set',
  'setattr',
  'slice',
  'sorted',
  'staticmethod',
  'str',
  'sum',
  'super',
  'tuple',
  'type',
  'vars',
  'zip'
]

export const pythonMonarchLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.python',
  keywords: PYTHON_KEYWORDS,
  builtins: PYTHON_BUILTINS,
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' }
  ],
  tokenizer: {
    root: [
      { include: '@whitespace' },
      [/@[a-zA-Z_]\w*/, 'annotation'],
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@builtins': 'type.identifier',
          '@default': 'identifier'
        }
      }],
      [/(?:[rubf]|br|rb|fr|rf)?"""/, 'string.quote', '@tripleDoubleString'],
      [/(?:[rubf]|br|rb|fr|rf)?'''/, 'string.quote', '@tripleSingleString'],
      [/(?:[rubf]|br|rb|fr|rf)?"/, 'string.quote', '@doubleString'],
      [/(?:[rubf]|br|rb|fr|rf)?'/, 'string.quote', '@singleString'],
      [/0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*/, 'number.hex'],
      [/0[oO][0-7](?:_?[0-7])*/, 'number.octal'],
      [/0[bB][01](?:_?[01])*/, 'number.binary'],
      [/(?:\d(?:_?\d)*)?\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?/, 'number.float'],
      [/\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?/, 'number'],
      [/[{}()[\]]/, '@brackets'],
      [/[,:;.]/, 'delimiter'],
      [/[+\-*\/%@&|^~<>!=]=?|\/\/|\*\*/, 'operator']
    ],
    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/#.*$/, 'comment']
    ],
    doubleString: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string.quote', '@pop']
    ],
    singleString: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string.quote', '@pop']
    ],
    tripleDoubleString: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"""/, 'string.quote', '@pop'],
      [/"/, 'string']
    ],
    tripleSingleString: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'''/, 'string.quote', '@pop'],
      [/'/, 'string']
    ]
  }
}

/**
 * Registers the lightweight Python grammar missing from the Pyright VSIX.
 * Pyright continues to own completion and diagnostics; Monarch only owns
 * lexical coloring and bracket/comment behavior.
 */
export function registerPythonSyntaxHighlighting(): monaco.IDisposable {
  if (!monaco.languages.getLanguages().some(({ id }) => id === 'python')) {
    monaco.languages.register({
      id: 'python',
      aliases: ['Python'],
      extensions: ['.py', '.pyi']
    })
  }
  const tokens = monaco.languages.setMonarchTokensProvider(
    'python',
    pythonMonarchLanguage
  )
  const configuration = monaco.languages.setLanguageConfiguration('python', {
    comments: { lineComment: '#' },
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] }
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ]
  })
  return {
    dispose: () => {
      configuration.dispose()
      tokens.dispose()
    }
  }
}

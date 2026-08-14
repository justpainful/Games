// @ts-check
import js from '@eslint/js'
import ts from 'typescript-eslint'

/**
 * القاعدة الأهم في هذا الملف هي منع تسرّب discord.js إلى منطق الألعاب والمشاهد.
 * هي وحدها ما يجعل تطبيق الجوال لاحقًا "إضافة سطح" بدل إعادة كتابة،
 * ولذلك هي خطأ يكسر البناء لا تحذير.
 */
export default ts.config(
  // ملف الإعداد نفسه خارج مشروع tsconfig فلا يُفحص بالقواعد المعتمدة على الأنواع
  // سكربتات `.mjs` خارج المشروع النوعي عمدًا: هي أدوات تُشغَّل بـnode مباشرة
  // ولا تدخل البناء، وإدخالها في tsconfig لأجل الفحص وحده يوسّع سطح الترجمة
  // بلا مقابل.
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', '.cache/**', 'eslint.config.js', '**/*.mjs'],
  },

  js.configs.recommended,
  ...ts.configs.recommended,

  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  {
    files: ['src/games/**/*.ts', 'src/scenes/**/*.ts', 'src/design/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'discord.js',
              message:
                'منطق الألعاب والمشاهد يجب أن يبقى مستقلًا عن ديسكورد — تطبيق الجوال سيستهلك نفس الملفات. ' +
                'أرجِع Scene وحدثًا مجردًا، ودع src/discord/ يترجمه.',
            },
            {
              name: 'playwright',
              message: 'الرندر يخص src/images/ وحده. المشهد يصف ما يُعرض، لا كيف يُرسم.',
            },
          ],
          patterns: [
            {
              group: ['**/discord/**', '**/images/**'],
              message:
                'اعتماد معكوس: games/ و scenes/ لا يعرفان ديسكورد ولا محرك الصور. ' +
                'الاتجاه الصحيح: discord/ و images/ يستوردان من games/ و scenes/.',
            },
          ],
        },
      ],
    },
  },
)

import { describe, expect, it } from 'vitest'
import { matches, normalize, normalizeLoose } from './arabic.ts'

describe('توحيد الألف', () => {
  it('يوحّد أ إ آ ٱ إلى ا', () => {
    expect(normalize('أحمد')).toBe('احمد')
    expect(normalize('إسلام')).toBe('اسلام')
    expect(normalize('آسيا')).toBe('اسيا')
    expect(normalize('ٱسم')).toBe('اسم')
  })

  it('يقبل إجابة كُتبت بألف عارية', () => {
    expect(matches('احمد', 'أحمد')).toBe(true)
    expect(matches('اسيا', 'آسيا')).toBe(true)
  })

  it('يجمع الألف المفكّكة (ا + همزة) قبل التوحيد', () => {
    // ا + U+0654 (همزة فوق) — شكل مفكّك يصل أحيانًا من النسخ واللصق
    expect(normalize('أحمد')).toBe('احمد')
  })
})

describe('التاء المربوطة', () => {
  it('يحوّل ة إلى ه', () => {
    expect(normalize('مكة')).toBe('مكه')
    expect(normalize('قطة')).toBe('قطه')
  })

  it('يقبل «مكه» مقابل «مكة»', () => {
    expect(matches('مكه', 'مكة')).toBe(true)
  })
})

describe('الألف المقصورة', () => {
  it('يحوّل ى إلى ي', () => {
    expect(normalize('مستشفى')).toBe('مستشفي')
    expect(normalize('موسى')).toBe('موسي')
  })

  it('يقبل «موسي» مقابل «موسى»', () => {
    expect(matches('موسي', 'موسى')).toBe(true)
  })
})

describe('الهمزات ؤ و ئ', () => {
  it('يردّ ؤ إلى و و ئ إلى ي في الصيغة المعيارية', () => {
    expect(normalize('مؤمن')).toBe('مومن')
    expect(normalize('بئر')).toBe('بير')
  })

  it('يقبل الهمزة الناقصة', () => {
    expect(matches('مومن', 'مؤمن')).toBe(true)
    expect(matches('بير', 'بئر')).toBe(true)
  })

  it('يطابق كرسيَي الهمزة رغم أن الردّ إلى حرف يفرّقهما', () => {
    // القرار الموثّق: «مسؤول» ← «مسوول» و«مسئول» ← «مسيول» — مختلفتان!
    expect(normalize('مسؤول')).not.toBe(normalize('مسئول'))
    // ولذلك الصيغة الفضفاضة تحذف الهمزة فتلتقيان
    expect(normalizeLoose('مسؤول')).toBe('مسول')
    expect(normalizeLoose('مسئول')).toBe('مسول')
    expect(matches('مسؤول', 'مسئول')).toBe(true)
    expect(matches('شؤون', 'شئون')).toBe(true)
  })

  it('يتسامح مع حذف الهمزة المفردة', () => {
    expect(matches('سما', 'سماء')).toBe(true)
    expect(matches('شي', 'شيء')).toBe(true)
  })
})

describe('التشكيل', () => {
  it('يحذف الفتحة والضمة والكسرة والشدة والسكون', () => {
    expect(normalize('مُحَمَّد')).toBe('محمد')
    expect(normalize('مَنْ')).toBe('من')
    expect(normalize('كِتَاب')).toBe('كتاب')
  })

  it('يحذف التنوين', () => {
    expect(normalize('كتابٌ')).toBe('كتاب')
    expect(normalize('كتاباً')).toBe('كتابا')
    expect(normalize('كتابٍ')).toBe('كتاب')
  })

  it('يحذف الألف الخنجرية U+0670', () => {
    expect(normalize('هٰذا')).toBe('هذا')
    expect(normalize('رحمٰن')).toBe('رحمن')
  })

  it('يقبل الإجابة المشكّلة مقابل غير المشكّلة', () => {
    expect(matches('مُحَمَّدٌ', 'محمد')).toBe(true)
  })
})

describe('التطويل', () => {
  it('يحذف الكشيدة U+0640', () => {
    expect(normalize('مـــرحبا')).toBe('مرحبا')
    expect(normalize('سـلـام')).toBe('سلام')
  })

  it('يقبل الإجابة الممطوطة', () => {
    expect(matches('مـــصـــر', 'مصر')).toBe(true)
  })
})

describe('الأرقام', () => {
  it('يحوّل الأرقام العربية الهندية', () => {
    expect(normalize('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(normalize('٢٠٢٤')).toBe('2024')
  })

  it('يحوّل الأرقام الفارسية', () => {
    expect(normalize('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789')
    expect(normalize('۱۹۴۵')).toBe('1945')
  })

  it('يقبل رقمًا كُتب بأي مجموعة', () => {
    expect(matches('٢٠٢٤', '2024')).toBe(true)
    expect(matches('۲۰۲۴', '٢٠٢٤')).toBe(true)
  })
})

describe('المسافات', () => {
  it('يوحّد المسافات المتعددة ويقصّ الأطراف', () => {
    expect(normalize('   نعم    لا   ')).toBe('نعم لا')
    expect(normalize('كرة\t\tالقدم')).toBe('كره قدم')
    expect(normalize('سطر\nثان')).toBe('سطر ثان')
  })

  it('المسافة غير القاطعة والمسافات الخاصة', () => {
    expect(normalize('نعم لا')).toBe('نعم لا')
    expect(normalize('نعم　لا')).toBe('نعم لا')
    expect(matches('نعم لا', 'نعم لا')).toBe(true)
  })

  it('المقارنة لا تكترث للمسافات إطلاقًا', () => {
    expect(matches('عبدالله', 'عبد الله')).toBe(true)
  })
})

describe('المحارف غير المرئية', () => {
  it('يحذف ZWJ و ZWNJ و RLM/LRM و BOM', () => {
    expect(normalize('ن‍عم')).toBe('نعم')
    expect(normalize('ن‌عم')).toBe('نعم')
    expect(normalize('‏نعم‎')).toBe('نعم')
    expect(normalize('﻿نعم')).toBe('نعم')
  })

  it('كلمة فيها تطويل ومحارف اتجاه مخفية', () => {
    expect(normalize('‫القـــاهرة‏‬')).toBe('قاهره')
    expect(matches('‏مـــصر‎', 'مصر')).toBe(true)
  })
})

describe('الترقيم', () => {
  it('يحذف الترقيم من أطراف النص', () => {
    expect(normalize('نعم!')).toBe('نعم')
    expect(normalize('نعم؟')).toBe('نعم')
    expect(normalize('«القاهرة»')).toBe('قاهره')
    expect(normalize('"باريس"')).toBe('باريس')
    expect(normalize('...مصر...')).toBe('مصر')
  })

  it('يحذف الترقيم من أطراف كل كلمة', () => {
    expect(normalize('مصر، السعودية.')).toBe('مصر سعوديه')
    expect(normalize('نعم ؛ لا')).toBe('نعم لا')
  })

  it('يقبل إجابة منتهية بعلامة تعجّب', () => {
    expect(matches('مصر!!!', 'مصر')).toBe(true)
  })
})

describe('اللاتيني', () => {
  it('يصغّر الحروف اللاتينية', () => {
    expect(normalize('Hello World')).toBe('hello world')
    expect(normalize('PARIS')).toBe('paris')
  })

  it('يقبل الإجابة اللاتينية بأي حالة أحرف', () => {
    expect(matches('PaRiS', 'paris')).toBe(true)
    expect(matches('  Real Madrid  ', 'real madrid')).toBe(true)
  })
})

describe('«ال» التعريف', () => {
  it('يحذف «ال» من بداية الكلمة', () => {
    expect(normalize('النيل')).toBe('نيل')
    expect(normalize('الشمس')).toBe('شمس')
    expect(normalize('البحر الأحمر')).toBe('بحر احمر')
  })

  it('يقبل الإجابة بأداة التعريف أو بدونها', () => {
    expect(matches('النيل', 'نيل')).toBe(true)
    expect(matches('نيل', 'النيل')).toBe(true)
    expect(matches('بحر الاحمر', 'البحر الأحمر')).toBe(true)
  })

  it('لا يمسّ الكلمات التي «ال» فيها من بنيتها', () => {
    expect(normalize('الله')).toBe('الله')
    expect(normalize('التي')).toBe('التي')
    expect(normalize('الذي')).toBe('الذي')
    expect(normalize('الآن')).toBe('الان')
  })

  it('يحمي الكلمات القصيرة جدًا بشرط بقاء حرفين', () => {
    // «إلى» ← «الي»؛ اقتطاع «ال» يترك حرفًا واحدًا فيُمنع
    expect(normalize('إلى')).toBe('الي')
    expect(normalize('إلا')).toBe('الا')
    // بينما الجذور من حرفين تبقى مقتطعة
    expect(normalize('اليد')).toBe('يد')
    expect(matches('اليد', 'يد')).toBe(true)
  })

  it('«الله» تعمل داخل جملة وبتشكيل كامل', () => {
    expect(normalize('بسم اللَّه')).toBe('بسم الله')
    expect(matches('عبدالله', 'عبد اللَّه')).toBe(true)
  })

  it('قرار موثّق: أسماء أعلام تبدأ بـ«أل» تُقتطع (ثمن مقبول)', () => {
    // «ألمانيا» ← «المانيا» ← «مانيا». الاقتطاع متماثل على الطرفين
    // فالمطابقة الصحيحة تبقى سليمة؛ الخطر الوحيد قبولٌ أوسع.
    expect(normalize('ألمانيا')).toBe('مانيا')
    expect(matches('ألمانيا', 'المانيا')).toBe(true)
    expect(matches('ألمانيا', 'ألمانيا')).toBe(true)
  })
})

describe('نص فارغ و null', () => {
  it('يعيد نصًا فارغًا لكل المدخلات الفارغة', () => {
    expect(normalize('')).toBe('')
    expect(normalize('     ')).toBe('')
    expect(normalize('\t\n')).toBe('')
    expect(normalize('‏‎﻿')).toBe('')
    expect(normalize('!!!')).toBe('')
  })

  it('لا ينهار على null/undefined', () => {
    expect(normalize(null as unknown as string)).toBe('')
    expect(normalize(undefined as unknown as string)).toBe('')
    expect(normalizeLoose(null as unknown as string)).toBe('')
    expect(() => normalize(123 as unknown as string)).not.toThrow()
  })

  it('يرفض الإجابة الفارغة دائمًا', () => {
    expect(matches('', 'مصر')).toBe(false)
    expect(matches('    ', 'مصر')).toBe(false)
    expect(matches(null as unknown as string, 'مصر')).toBe(false)
    expect(matches('؟؟؟', 'مصر')).toBe(false)
    // حتى لو كانت الإجابة الصحيحة نفسها فارغة
    expect(matches('', '')).toBe(false)
    expect(matches('مصر', '')).toBe(false)
  })
})

describe('إملاء مختلف لنفس الإجابة', () => {
  it('«انشاء الله» تطابق «إن شاء الله»', () => {
    expect(matches('انشاء الله', 'إن شاء الله')).toBe(true)
    expect(matches('إن شاء الله', 'انشاء الله')).toBe(true)
    expect(matches('ان شاء الله', 'إن شاء اللَّه')).toBe(true)
  })

  it('أمثلة إملائية شائعة أخرى', () => {
    expect(matches('صلاه', 'صلاة')).toBe(true)
    expect(matches('لاكن', 'لكن')).toBe(false) // خطأ إملائي حقيقي يظلّ خطأ
    expect(matches('المملكه العربيه السعوديه', 'المملكة العربية السعودية')).toBe(true)
  })
})

describe('خلط عربي/لاتيني/أرقام', () => {
  it('يطبّع النص المختلط', () => {
    expect(normalize('Real مدريد ٢٠٢٤')).toBe('real مدريد 2024')
    expect(normalize('  iPhone ١٥ Pro  ')).toBe('iphone 15 pro')
  })

  it('يقارن النص المختلط', () => {
    expect(matches('WhatsApp ٢٠٢٤', 'whatsapp 2024')).toBe(true)
    expect(matches('الفيفا ٢٠٢٦', 'فيفا 2026')).toBe(true)
  })
})

describe('الإيموجي', () => {
  it('لا يكسر الدالة ويُبقي الإيموجي', () => {
    expect(() => normalize('قطة 🐱')).not.toThrow()
    expect(normalize('قطة 🐱')).toBe('قطه 🐱')
    expect(normalize('🇸🇦')).toBe('🇸🇦')
    expect(matches('🐱', '🐱')).toBe(true)
  })

  it('لا يقطع الأزواج البديلة (surrogate pairs)', () => {
    const emoji = '😀😁😂🤣'
    expect(normalize(emoji)).toBe(emoji)
    expect(normalize(`  ${emoji}!  `)).toBe(emoji)
  })

  it('إيموجي مركّبة بـ ZWJ لا تُسقط الدالة', () => {
    expect(() => normalize('👨‍👩‍👧 عائلة')).not.toThrow()
    expect(matches('👨‍👩‍👧', '👨‍👩‍👧')).toBe(true)
  })
})

describe('نص طويل جدًا', () => {
  it('لا يتعطّل على مئة ألف حرف', () => {
    const long = 'أ'.repeat(100_000)
    const started = Date.now()
    expect(normalize(long)).toBe('ا'.repeat(100_000))
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('لا يتعطّل على نص طويل مليء بالتشكيل والتطويل', () => {
    const long = 'مُحَمَّدـــ '.repeat(20_000)
    expect(() => normalize(long)).not.toThrow()
    expect(normalize(long).split(' ')).toHaveLength(20_000)
  })

  it('المقارنة على نص طويل تبقى سريعة', () => {
    const long = `${'مصر '.repeat(30_000)}مصر`
    expect(matches(long, long)).toBe(true)
    expect(matches(long, 'مصر')).toBe(false)
  })
})

describe('الاختبار السلبي — كلمات مختلفة فعلًا', () => {
  it('«كتب» لا تطابق «كتاب»', () => {
    expect(normalize('كتب')).not.toBe(normalize('كتاب'))
    expect(matches('كتب', 'كتاب')).toBe(false)
    expect(matches('كتاب', 'كتب')).toBe(false)
  })

  it('كلمات أخرى متقاربة لا تتطابق', () => {
    expect(matches('مصر', 'قطر')).toBe(false)
    expect(matches('الرياض', 'رياضة')).toBe(false)
    expect(matches('علم', 'عالم')).toBe(false)
    expect(matches('قلم', 'قلب')).toBe(false)
    expect(matches('paris', 'pairs')).toBe(false)
  })

  it('إجابة جزئية لا تُقبل', () => {
    expect(matches('البحر', 'البحر الأحمر')).toBe(false)
    expect(matches('مصر السعودية', 'مصر')).toBe(false)
  })
})

describe('matches مع قائمة الإجابات المقبولة', () => {
  it('يقبل أي بديل من accept', () => {
    expect(matches('القاهرة', 'عاصمة مصر', ['القاهره', 'cairo'])).toBe(true)
    expect(matches('cairo', 'عاصمة مصر', ['القاهرة', 'cairo'])).toBe(true)
    expect(matches('CAIRO', 'عاصمة مصر', ['cairo'])).toBe(true)
  })

  it('يطبّع بدائل accept أيضًا', () => {
    expect(matches('الاسكندريه', 'ثاني أكبر مدينة', ['الإسكندريّة'])).toBe(true)
  })

  it('يرفض ما ليس في القائمة', () => {
    expect(matches('الجيزة', 'عاصمة مصر', ['القاهرة', 'cairo'])).toBe(false)
  })

  it('accept اختياري ويتحمّل قيمة غير صالحة', () => {
    expect(matches('مصر', 'مصر')).toBe(true)
    expect(matches('مصر', 'مصر', undefined)).toBe(true)
    expect(matches('مصر', 'مصر', [])).toBe(true)
    expect(matches('مصر', 'قطر', null as unknown as string[])).toBe(false)
    expect(matches('مصر', 'قطر', ['', '   '])).toBe(false)
  })
})

describe('التطبيع مستقرّ (idempotent)', () => {
  it('تطبيع المُطبَّع لا يغيّره', () => {
    for (const sample of ['الْقَاهِرَة', 'مـــصر ٢٠٢٤', 'إن شاء الله', 'Hello 🐱', '«النيل»']) {
      const once = normalize(sample)
      expect(normalize(once)).toBe(once)
    }
  })
})

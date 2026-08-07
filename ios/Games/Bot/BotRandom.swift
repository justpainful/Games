import Foundation

/// مولّد أعداد شبه عشوائية حتمي (SplitMix64).
///
/// السبب: لا يمكن اختبار سلوك احتمالي بمولّد النظام — نفس البذرة يجب أن تعطي
/// نفس السلسلة كي تصير اختبارات الصعوبة والتوقيت قابلة للإعادة.
public struct SeededGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) {
        // بذرة صفر تعطي حالة متدهورة في بعض المولّدات، فنزيحها.
        self.state = seed &+ 0x9E37_79B9_7F4A_7C15
    }

    public mutating func next() -> UInt64 {
        state = state &+ 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

/// مصدر العشوائية المحقون في البوتات.
///
/// البروتوكولات تفرض `Sendable` ودوالّها غير `mutating`، فلا يمكن تخزين
/// `RandomNumberGenerator` قابلًا للتغيير داخل `struct`. لذلك نغلّف الحالة في
/// صنف مقفول بقفل: البوت يبقى `struct` خفيفًا، والحالة العشوائية تتقدّم بين
/// النداءات، والاختبار يستطيع تثبيتها ببذرة.
public final class BotRandom: @unchecked Sendable {
    private let lock = NSLock()
    private var seeded: SeededGenerator?

    /// عشوائية النظام — الاستعمال الحقيقي في التطبيق.
    public init() {
        self.seeded = nil
    }

    /// عشوائية حتمية — للاختبارات وإعادة إنتاج المباريات.
    public init(seed: UInt64) {
        self.seeded = SeededGenerator(seed: seed)
    }

    public func next() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        if var generator = seeded {
            let value = generator.next()
            seeded = generator
            return value
        }
        var system = SystemRandomNumberGenerator()
        return system.next()
    }

    /// قيمة في `[0, 1)`.
    public func double() -> Double {
        // 53 بتًا هي أقصى دقّة لـ Double بلا فقدان.
        Double(next() >> 11) * (1.0 / 9_007_199_254_740_992.0)
    }

    /// قيمة في `[lower, upper]` تقريبًا؛ تعيد `lower` إن كان المدى مقلوبًا.
    public func double(in range: ClosedRange<Double>) -> Double {
        let lower = range.lowerBound
        let upper = range.upperBound
        guard upper > lower, lower.isFinite, upper.isFinite else { return lower }
        return lower + (upper - lower) * double()
    }

    /// عدد صحيح في `[0, bound)`؛ يعيد `0` إن كان الحدّ غير منطقي.
    public func int(below bound: Int) -> Int {
        guard bound > 0 else { return 0 }
        return Int(next() % UInt64(bound))
    }

    /// عنصر عشوائي، أو `nil` إن كانت القائمة فارغة.
    public func pick<T>(_ items: [T]) -> T? {
        guard !items.isEmpty else { return nil }
        return items[int(below: items.count)]
    }
}

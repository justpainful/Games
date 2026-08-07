import Foundation

/// خصم ألعاب الكتابة: يقرّر هل يجيب هذه الجولة وبعد كم ثانية.
///
/// البوت الذي يصيب دائمًا يحوّل اللعبة إلى عرضٍ يشاهده اللاعب، فالخطأ هنا جزء
/// من التصميم: احتمال الإصابة يتدرّج بالصعوبة ولا يبلغ اليقين أبدًا.
///
/// زمن الإجابة يُسحب من `Skill.thinkRange` ثم يُقاس على طول الجولة: المدى
/// معرّف على جولة مرجعية (`referenceRound`)، فيُحوّل إلى نسبة من الجولة ثم
/// يُضرب في `roundSeconds`. وأيًّا كان الحساب فالنتيجة تبقى **دون**
/// `roundSeconds` — زمن يتجاوز الجولة يعني بوتًا "أجاب" بعد انتهائها.
public struct TimedQuizBot: QuizOpponent {
    /// طول الجولة الذي عُرّف عليه `Skill.thinkRange` أصلًا.
    public static let referenceRound: Double = 10.0

    /// أقصى نسبة من الجولة يُسمح للبوت بأخذها.
    private static let latestFraction = 0.95

    /// سقف احتمال الإصابة — لا 1.0 أبدًا مهما كانت الإعدادات.
    private static let accuracyCeiling = 0.95

    public let random: BotRandom
    public let easyAccuracy: Double
    public let normalAccuracy: Double
    public let hardAccuracy: Double

    public init(random: BotRandom = BotRandom(),
                easyAccuracy: Double = 0.35,
                normalAccuracy: Double = 0.60,
                hardAccuracy: Double = 0.85) {
        self.random = random
        self.easyAccuracy = Self.clampAccuracy(easyAccuracy)
        self.normalAccuracy = Self.clampAccuracy(normalAccuracy)
        self.hardAccuracy = Self.clampAccuracy(hardAccuracy)
    }

    public func accuracy(for skill: Skill) -> Double {
        switch skill {
        case .easy: return easyAccuracy
        case .normal: return normalAccuracy
        case .hard: return hardAccuracy
        }
    }

    public func attempt(skill: Skill, roundSeconds: Double) -> Double? {
        guard roundSeconds.isFinite, roundSeconds > 0 else { return nil }
        guard random.double() < accuracy(for: skill) else { return nil }

        let range = skill.thinkRange
        let lower = max(0, range.lowerBound)
        let upper = max(lower, range.upperBound)
        let raw = lower + (upper - lower) * random.double()

        // نسبة من الجولة لا ثوانٍ مطلقة: جولة قصيرة تعني ردًّا أسرع.
        let fraction = min(Self.latestFraction, max(0.02, raw / Self.referenceRound))

        let ceiling = roundSeconds * Self.latestFraction
        var seconds = fraction * roundSeconds
        guard seconds.isFinite, ceiling > 0 else { return nil }

        seconds = min(seconds, ceiling)
        seconds = max(seconds, min(0.05, ceiling))

        // حزام أمان أخير: لا نعيد زمنًا يبلغ الجولة أو يتجاوزها.
        guard seconds > 0, seconds < roundSeconds else { return nil }
        return seconds
    }

    private static func clampAccuracy(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), accuracyCeiling)
    }
}

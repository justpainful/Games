import Foundation

/// خصم حجرة/ورقة/مقص يستغلّ أن البشر ليسوا عشوائيين.
///
/// اللاعب البشري يميل لتكرار ما فاز به وتغيير ما خسر به، وهذا الميل يظهر في
/// سلسلة اختياراته نفسها: التكرار انتقال من الخيار إلى نفسه، والتغيير انتقال
/// إلى خيار بعينه يفضّله. العقد يعطينا `history` (اختيارات اللاعب) بلا نتائج
/// الجولات، فنقيس الميل من الانتقالات مباشرة:
/// - سلسلة ماركوف من الرتبة الثانية (آخر خيارين ← الخيار التالي)، وهي التي
///   تلتقط أنماط "كرّر ثم غيّر".
/// - إن لم تكفِ البيانات: رتبة أولى (الخيار الأخير ← التالي).
/// - إن لم تكفِ: التكرار المطلق لكل خيار.
/// الجولات الأحدث تأخذ وزنًا أكبر، لأن اللاعب يبدّل أسلوبه أثناء المباراة.
///
/// **لا نفترض أسماء الخيارات ولا عددها**: `options` تأتي من المستدعي. نفترض
/// فقط الدورة المعتادة في هذه العائلة من الألعاب — الخيار `i` يغلب الخيار
/// `i - 1`، أي أن ما يغلب توقّعنا `p` هو `options[(p + 1) % n]`.
public struct PatternDuelBot: DuelOpponent {
    /// مصدر العشوائية — يُحقن كي يصير المزج بين التوقّع والعشوائية قابلًا للاختبار.
    public let random: BotRandom

    /// كم تتضاءل أهمّية الجولة كلما ابتعدت في الماضي.
    private static let decay = 0.9

    public init(random: BotRandom = BotRandom()) {
        self.random = random
    }

    public func choose(history: [String], options: [String], skill: Skill) -> String {
        // العقد يفرض إرجاع `String`؛ بلا خيارات لا يوجد ما يُعاد سوى نصّ فارغ،
        // والمستدعي هو من عليه ألا يستدعي بلا خيارات.
        guard !options.isEmpty else { return "" }
        if options.count == 1 { return options[0] }

        let noise: Double
        switch skill {
        case .easy: noise = 1.0      // عشوائي بحت
        case .normal: noise = 0.5    // نصف توقّع ونصف مفاجأة
        case .hard: noise = 0.0      // توقّع دائمًا
        }
        if noise > 0, random.double() < noise {
            return random.pick(options) ?? options[0]
        }

        var indexOf: [String: Int] = [:]
        for (index, option) in options.enumerated() where indexOf[option] == nil {
            indexOf[option] = index
        }

        // نتجاهل أي قيمة في التاريخ ليست ضمن الخيارات الحالية.
        let seen = history.compactMap { indexOf[$0] }
        guard let last = seen.last else {
            return random.pick(options) ?? options[0]
        }

        let count = options.count
        var weights = [Double](repeating: 0, count: count)

        // الرتبة الثانية.
        if seen.count >= 3 {
            let previous = seen[seen.count - 2]
            var weight = 1.0
            var index = seen.count - 3
            while index >= 0 {
                if seen[index] == previous && seen[index + 1] == last {
                    weights[seen[index + 2]] += weight
                }
                weight *= Self.decay
                index -= 1
            }
        }

        // الرتبة الأولى.
        if Self.isEmpty(weights), seen.count >= 2 {
            var weight = 1.0
            var index = seen.count - 2
            while index >= 0 {
                if seen[index] == last {
                    weights[seen[index + 1]] += weight
                }
                weight *= Self.decay
                index -= 1
            }
        }

        // التكرار المطلق.
        if Self.isEmpty(weights) {
            var weight = 1.0
            var index = seen.count - 1
            while index >= 0 {
                weights[seen[index]] += weight
                weight *= Self.decay
                index -= 1
            }
        }

        var bestWeight = -1.0
        var bestOptions: [Int] = []
        for (index, weight) in weights.enumerated() {
            if weight > bestWeight {
                bestWeight = weight
                bestOptions = [index]
            } else if weight == bestWeight {
                bestOptions.append(index)
            }
        }

        let predicted = random.pick(bestOptions) ?? last
        let counter = (predicted + 1) % count
        return options[counter]
    }

    private static func isEmpty(_ weights: [Double]) -> Bool {
        for weight in weights where weight > 0 { return false }
        return true
    }
}

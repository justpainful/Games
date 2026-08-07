import Foundation

/// مستوى صعوبة الخصم الآلي.
public enum Skill: String, CaseIterable, Codable, Sendable {
    case easy, normal, hard

    public var title: String {
        switch self {
        case .easy: "سهل"
        case .normal: "متوسط"
        case .hard: "صعب"
        }
    }

    /// كم يتأخّر البوت قبل أن يلعب.
    ///
    /// ليس تجميلًا: خصم يردّ فورًا يبدو غشًّا لا ذكاءً، ويحرم اللاعب من إحساس
    /// المنافسة. التأخير يقصر كلما زادت الصعوبة فيبدو الصعب أكثر حسمًا.
    public var thinkRange: ClosedRange<Double> {
        switch self {
        case .easy: 1.6...3.0
        case .normal: 1.0...2.2
        case .hard: 0.6...1.4
        }
    }
}

/// خصم آلي للألعاب ذات اللوحة (إكس أو، أربعة في صف).
public protocol BoardOpponent: Sendable {
    /// يعيد فهرس الخانة التي يلعبها، أو nil إن لم يبقَ نقلة.
    func move(board: [String?], cols: Int, me: String, rival: String, skill: Skill) -> Int?
}

/// خصم آلي للمواجهات (حجرة ورقة مقص).
public protocol DuelOpponent: Sendable {
    /// يختار حركته اعتمادًا على تاريخ اختيارات اللاعب.
    func choose(history: [String], options: [String], skill: Skill) -> String
}

/// خصم آلي لألعاب الكتابة.
public protocol QuizOpponent: Sendable {
    /// هل سيجيب البوت هذه الجولة إجابةً صحيحة، وبعد كم ثانية؟
    ///
    /// النتيجة `nil` تعني أنه لن يجيب — البوت الذي يصيب دائمًا يجعل اللعبة
    /// بلا معنى، فالخطأ جزء من التصميم لا نقص فيه.
    func attempt(skill: Skill, roundSeconds: Double) -> Double?
}

/// نقطة الوصول الموحّدة للخصوم — تُحقن في شاشات اللعب.
public enum Bots {
    public static let board: BoardOpponent = MinimaxBoardBot()
    public static let duel: DuelOpponent = PatternDuelBot()
    public static let quiz: QuizOpponent = TimedQuizBot()

    /// اسم يظهر للاعب بدل "بوت".
    public static let displayName = "الخصم الآلي"
}

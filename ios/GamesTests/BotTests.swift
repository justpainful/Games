import XCTest
@testable import Games

/// اختبارات محرّكات الخصم الآلي.
///
/// كل بوت يأخذ `BotRandom(seed:)` كي تكون كل نتيجة قابلة لإعادة الإنتاج —
/// اختبار سلوك احتمالي بمولّد النظام يعني اختبارًا يفشل يومًا بلا سبب.
final class BotTests: XCTestCase {

    // MARK: - أدوات مساعدة

    private let ticTacToeCols = 3
    private let connectCols = 7
    private let connectRows = 6

    private func emptyBoard(_ count: Int) -> [String?] {
        [String?](repeating: nil, count: count)
    }

    /// أدنى خانة فارغة في عمود لوحة الجاذبية، أو `nil` إن كان العمود ممتلئًا.
    private func lowestEmpty(_ board: [String?], cols: Int, column: Int) -> Int? {
        let rows = board.count / cols
        var row = rows - 1
        while row >= 0 {
            let index = row * cols + column
            if board[index] == nil { return index }
            row -= 1
        }
        return nil
    }

    private func ticTacToeWinner(_ board: [String?]) -> String? {
        let lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8],
                     [0, 3, 6], [1, 4, 7], [2, 5, 8],
                     [0, 4, 8], [2, 4, 6]]
        for line in lines {
            if let value = board[line[0]], value == board[line[1]], value == board[line[2]] {
                return value
            }
        }
        return nil
    }

    // MARK: - إكس أو

    func testTicTacToeHardTakesImmediateWin() {
        // X X .        البوت (X) يكمل الصفّ الأعلى بالخانة 2.
        // O O .        وجود تهديد للخصم في الخانة 5 يجب ألا يصرفه عن الفوز.
        // . . .
        var board = emptyBoard(9)
        board[0] = "X"; board[1] = "X"
        board[3] = "O"; board[4] = "O"

        let bot = MinimaxBoardBot(random: BotRandom(seed: 1))
        let move = bot.move(board: board, cols: ticTacToeCols, me: "X", rival: "O", skill: .hard)
        XCTAssertEqual(move, 2, "الفوز الفوري أولى من أي شيء آخر")
    }

    func testTicTacToeHardBlocksImmediateLoss() {
        // X . .        الخصم (O) يهدّد بالخانة 5، والبوت لا يملك فوزًا فوريًا.
        // O O .
        // . . .
        var board = emptyBoard(9)
        board[0] = "X"
        board[3] = "O"; board[4] = "O"

        let bot = MinimaxBoardBot(random: BotRandom(seed: 2))
        let move = bot.move(board: board, cols: ticTacToeCols, me: "X", rival: "O", skill: .hard)
        XCTAssertEqual(move, 5, "خطّ الخصم الوشيك يجب أن يُسدّ")
    }

    func testTicTacToeHardNeverLosesFromAnyLine() {
        // مباراة كاملة برمجيًا: الخصم يجرّب كل نقلة ممكنة في كل موضع،
        // والبوت الصعب يجب ألا يخسر ولا مرّة واحدة في أي فرع.
        for seed in [7, 11, 23] as [UInt64] {
            let bot = MinimaxBoardBot(random: BotRandom(seed: seed))

            // البوت يبدأ.
            var memoBotFirst = Set<String>()
            walkTicTacToe(board: emptyBoard(9), botTurn: true, bot: bot, memo: &memoBotFirst)

            // الخصم يبدأ.
            var memoRivalFirst = Set<String>()
            walkTicTacToe(board: emptyBoard(9), botTurn: false, bot: bot, memo: &memoRivalFirst)
        }
    }

    private func walkTicTacToe(board: [String?], botTurn: Bool,
                               bot: MinimaxBoardBot, memo: inout Set<String>) {
        if let winner = ticTacToeWinner(board) {
            XCTAssertNotEqual(winner, "O", "البوت الصعب خسر في هذا الفرع: \(board.map { $0 ?? "." })")
            return
        }

        var empties: [Int] = []
        for index in board.indices where board[index] == nil {
            empties.append(index)
        }
        if empties.isEmpty { return }

        let key = board.map { $0 ?? "." }.joined() + (botTurn ? "|B" : "|H")
        if memo.contains(key) { return }
        memo.insert(key)

        if botTurn {
            guard let move = bot.move(board: board, cols: 3, me: "X", rival: "O", skill: .hard) else {
                XCTFail("البوت أعاد nil رغم وجود خانات فارغة")
                return
            }
            guard move >= 0, move < board.count, board[move] == nil else {
                XCTFail("البوت اختار خانة غير مشروعة: \(move)")
                return
            }
            var next = board
            next[move] = "X"
            walkTicTacToe(board: next, botTurn: false, bot: bot, memo: &memo)
        } else {
            for index in empties {
                var next = board
                next[index] = "O"
                walkTicTacToe(board: next, botTurn: true, bot: bot, memo: &memo)
            }
        }
    }

    func testTicTacToeFullBoardReturnsNil() {
        let board: [String?] = ["X", "O", "X",
                                "X", "O", "O",
                                "O", "X", "X"]
        let bot = MinimaxBoardBot(random: BotRandom(seed: 3))
        for skill in Skill.allCases {
            XCTAssertNil(bot.move(board: board, cols: 3, me: "X", rival: "O", skill: skill))
        }
    }

    func testTicTacToeAllSkillsPlayLegalMoves() {
        var board = emptyBoard(9)
        board[4] = "O"
        board[0] = "X"
        let bot = MinimaxBoardBot(random: BotRandom(seed: 4))
        for skill in Skill.allCases {
            for _ in 0..<50 {
                guard let move = bot.move(board: board, cols: 3, me: "X", rival: "O", skill: skill) else {
                    XCTFail("nil رغم وجود خانات فارغة")
                    continue
                }
                XCTAssertTrue(move >= 0 && move < 9)
                XCTAssertNil(board[move])
            }
        }
    }

    /// الصعوبة يجب أن تكون فرقًا حقيقيًا: السهل يخطئ كثيرًا والصعب لا يخطئ.
    func testEasyBlundersWhileHardDoesNot() {
        var board = emptyBoard(9)
        board[0] = "X"
        board[3] = "O"; board[4] = "O"   // الخانة 5 هي السدّ الوحيد

        let easyBot = MinimaxBoardBot(random: BotRandom(seed: 5))
        var easyBlocks = 0
        for _ in 0..<200 {
            if easyBot.move(board: board, cols: 3, me: "X", rival: "O", skill: .easy) == 5 {
                easyBlocks += 1
            }
        }
        XCTAssertLessThan(easyBlocks, 180, "السهل يجب أن يخطئ أحيانًا")

        let hardBot = MinimaxBoardBot(random: BotRandom(seed: 6))
        for _ in 0..<50 {
            XCTAssertEqual(hardBot.move(board: board, cols: 3, me: "X", rival: "O", skill: .hard), 5)
        }
    }

    // MARK: - أربعة في صف

    func testConnectFourCompletesWinningRow() {
        // الصفّ السفلي (الأعمدة 1،2،3) للبوت، والعمود 0 مشغول بالخصم،
        // فالفوز الوحيد بإسقاط قطعة في العمود 4 ← الخانة 39.
        var board = emptyBoard(connectRows * connectCols)
        board[36] = "R"; board[37] = "R"; board[38] = "R"
        board[35] = "Y"; board[40] = "Y"; board[41] = "Y"

        let bot = MinimaxBoardBot(random: BotRandom(seed: 8))
        let move = bot.move(board: board, cols: connectCols, me: "R", rival: "Y", skill: .hard)
        XCTAssertEqual(move, 39, "الفوز الفوري بإسقاط القطعة في العمود 4")
        XCTAssertEqual(move.map { $0 % connectCols }, 4)
    }

    func testConnectFourBlocksOpponentRow() {
        // الخصم يملك الأعمدة 1،2،3 في الصفّ السفلي، والعمود 0 مسدود،
        // فالسدّ الوحيد هو العمود 4 ← الخانة 39.
        var board = emptyBoard(connectRows * connectCols)
        board[36] = "Y"; board[37] = "Y"; board[38] = "Y"
        board[35] = "R"; board[41] = "R"

        let bot = MinimaxBoardBot(random: BotRandom(seed: 9))
        let move = bot.move(board: board, cols: connectCols, me: "R", rival: "Y", skill: .hard)
        XCTAssertEqual(move, 39, "تهديد الخصم في العمود 4 يجب أن يُسدّ")
    }

    func testConnectFourNeverPicksFullColumn() {
        // العمود 3 ممتلئ بتناوب لا يصنع أربعة رأسية.
        var board = emptyBoard(connectRows * connectCols)
        let column = 3
        for row in 0..<connectRows {
            board[row * connectCols + column] = (row % 2 == 0) ? "R" : "Y"
        }

        let bot = MinimaxBoardBot(random: BotRandom(seed: 10))
        for skill in Skill.allCases {
            for _ in 0..<6 {
                guard let move = bot.move(board: board, cols: connectCols,
                                          me: "R", rival: "Y", skill: skill) else {
                    XCTFail("nil رغم وجود أعمدة فارغة")
                    continue
                }
                XCTAssertNotEqual(move % connectCols, column, "اختار عمودًا ممتلئًا")
                XCTAssertNil(board[move], "اختار خانة مشغولة")
                XCTAssertEqual(lowestEmpty(board, cols: connectCols, column: move % connectCols), move,
                               "القطعة لم تسقط لأدنى خانة فارغة")
            }
        }
    }

    /// اللوحة ليست شبكة حرّة: كل نقلة يجب أن تكون خانة الهبوط في عمودها.
    func testConnectFourAlwaysLandsAtBottomOfColumn() {
        let rng = BotRandom(seed: 11)
        let bot = MinimaxBoardBot(random: BotRandom(seed: 12))

        for _ in 0..<10 {
            var board = emptyBoard(connectRows * connectCols)
            let drops = rng.int(below: 20)
            for drop in 0..<drops {
                let column = rng.int(below: connectCols)
                if let landing = lowestEmpty(board, cols: connectCols, column: column) {
                    board[landing] = (drop % 2 == 0) ? "R" : "Y"
                }
            }
            guard let move = bot.move(board: board, cols: connectCols,
                                      me: "R", rival: "Y", skill: .normal) else {
                XCTFail("nil رغم وجود خانات فارغة")
                continue
            }
            XCTAssertNil(board[move])
            XCTAssertEqual(lowestEmpty(board, cols: connectCols, column: move % connectCols), move)
        }
    }

    func testConnectFourFullBoardReturnsNil() {
        var board = emptyBoard(connectRows * connectCols)
        for index in board.indices {
            board[index] = (index % 2 == 0) ? "R" : "Y"
        }
        let bot = MinimaxBoardBot(random: BotRandom(seed: 13))
        for skill in Skill.allCases {
            XCTAssertNil(bot.move(board: board, cols: connectCols, me: "R", rival: "Y", skill: skill))
        }
    }

    // MARK: - لوحات غير صالحة

    func testInvalidBoardsReturnNilInsteadOfCrashing() {
        let bot = MinimaxBoardBot(random: BotRandom(seed: 14))

        XCTAssertNil(bot.move(board: [], cols: 3, me: "X", rival: "O", skill: .hard))
        XCTAssertNil(bot.move(board: emptyBoard(9), cols: 0, me: "X", rival: "O", skill: .hard))
        XCTAssertNil(bot.move(board: emptyBoard(9), cols: -3, me: "X", rival: "O", skill: .hard))
        // 10 لا تقبل القسمة على 3 ← هندسة مستحيلة.
        XCTAssertNil(bot.move(board: emptyBoard(10), cols: 3, me: "X", rival: "O", skill: .hard))
        XCTAssertNil(bot.move(board: [], cols: 0, me: "X", rival: "O", skill: .easy))
    }

    func testBoardWithUnknownSymbolsStaysLegal() {
        // قيم لا تخصّ أيًّا من اللاعبين يجب أن تُعامَل كخانات مشغولة لا كخانات فارغة.
        var board = emptyBoard(9)
        board[0] = "?"; board[1] = "#"; board[2] = "X"; board[4] = "O"
        let bot = MinimaxBoardBot(random: BotRandom(seed: 15))
        for skill in Skill.allCases {
            for _ in 0..<30 {
                guard let move = bot.move(board: board, cols: 3, me: "X", rival: "O", skill: skill) else {
                    XCTFail("nil رغم وجود خانات فارغة")
                    continue
                }
                XCTAssertNil(board[move])
            }
        }
    }

    func testSameSymbolForBothPlayersStillReturnsLegalMove() {
        var board = emptyBoard(9)
        board[0] = "X"
        let bot = MinimaxBoardBot(random: BotRandom(seed: 16))
        guard let move = bot.move(board: board, cols: 3, me: "X", rival: "X", skill: .hard) else {
            XCTFail("nil رغم وجود خانات فارغة")
            return
        }
        XCTAssertNil(board[move])
    }

    func testBoardBotIsDeterministicUnderSameSeed() {
        var board = emptyBoard(9)
        board[4] = "O"
        let first = MinimaxBoardBot(random: BotRandom(seed: 4242))
        let second = MinimaxBoardBot(random: BotRandom(seed: 4242))
        for _ in 0..<30 {
            let a = first.move(board: board, cols: 3, me: "X", rival: "O", skill: .easy)
            let b = second.move(board: board, cols: 3, me: "X", rival: "O", skill: .easy)
            XCTAssertEqual(a, b)
        }
    }

    // MARK: - حجرة ورقة مقص

    private let rps = ["حجر", "ورقة", "مقص"]

    func testDuelAlwaysReturnsOneOfTheGivenOptions() {
        let bot = PatternDuelBot(random: BotRandom(seed: 21))
        let rng = BotRandom(seed: 22)
        let optionSets = [rps,
                          ["🪨", "📄", "✂️", "🦎", "🖖"],
                          ["a", "b"],
                          ["only"]]

        for options in optionSets {
            for skill in Skill.allCases {
                var history: [String] = []
                for _ in 0..<200 {
                    let result = bot.choose(history: history, options: options, skill: skill)
                    XCTAssertTrue(options.contains(result), "أعاد قيمة خارج الخيارات: \(result)")
                    if let pick = rng.pick(options) { history.append(pick) }
                }
            }
        }
    }

    func testDuelEmptyOptionsDoesNotCrash() {
        let bot = PatternDuelBot(random: BotRandom(seed: 23))
        for skill in Skill.allCases {
            XCTAssertEqual(bot.choose(history: rps, options: [], skill: skill), "")
            XCTAssertEqual(bot.choose(history: [], options: [], skill: skill), "")
        }
    }

    func testDuelEmptyHistoryStaysWithinOptions() {
        let bot = PatternDuelBot(random: BotRandom(seed: 24))
        for skill in Skill.allCases {
            for _ in 0..<100 {
                let result = bot.choose(history: [], options: rps, skill: skill)
                XCTAssertTrue(rps.contains(result))
            }
        }
    }

    func testDuelIgnoresHistoryValuesOutsideOptions() {
        let bot = PatternDuelBot(random: BotRandom(seed: 25))
        let history = ["نار", "ماء", "قلم", "شيء آخر"]
        for skill in Skill.allCases {
            for _ in 0..<100 {
                let result = bot.choose(history: history, options: rps, skill: skill)
                XCTAssertTrue(rps.contains(result))
            }
        }
    }

    func testDuelHardCountersConstantPlayer() {
        // لاعب يكرّر "حجر" ← التوقّع "حجر" ← الردّ "ورقة".
        let bot = PatternDuelBot(random: BotRandom(seed: 26))
        let history = [String](repeating: "حجر", count: 12)
        for _ in 0..<50 {
            XCTAssertEqual(bot.choose(history: history, options: rps, skill: .hard), "ورقة")
        }
    }

    func testDuelHardCountersAlternatingPlayer() {
        // نمط "حجر، ورقة" متكرّر: بعد "ورقة" يأتي "حجر" ← الردّ "ورقة".
        let bot = PatternDuelBot(random: BotRandom(seed: 27))
        var history: [String] = []
        for index in 0..<12 {
            history.append(index % 2 == 0 ? "حجر" : "ورقة")
        }
        for _ in 0..<50 {
            XCTAssertEqual(bot.choose(history: history, options: rps, skill: .hard), "ورقة")
        }
    }

    func testDuelEasyIsActuallyRandom() {
        // السهل عشوائي بحت: يجب ألا يلتزم بردّ واحد أمام لاعب ثابت.
        let bot = PatternDuelBot(random: BotRandom(seed: 28))
        let history = [String](repeating: "حجر", count: 12)
        var counters = 0
        for _ in 0..<300 {
            if bot.choose(history: history, options: rps, skill: .easy) == "ورقة" { counters += 1 }
        }
        XCTAssertLessThan(counters, 200, "السهل لا يجب أن يتوقّع دائمًا")
        XCTAssertGreaterThan(counters, 30, "السهل يجب أن يصادف الردّ الصحيح أحيانًا")
    }

    func testDuelIsDeterministicUnderSameSeed() {
        let first = PatternDuelBot(random: BotRandom(seed: 777))
        let second = PatternDuelBot(random: BotRandom(seed: 777))
        var history: [String] = []
        for index in 0..<60 {
            let a = first.choose(history: history, options: rps, skill: .normal)
            let b = second.choose(history: history, options: rps, skill: .normal)
            XCTAssertEqual(a, b)
            history.append(rps[index % rps.count])
        }
    }

    // MARK: - بوت الأسئلة

    func testQuizNeverAnswersAfterRoundEnds() {
        let bot = TimedQuizBot(random: BotRandom(seed: 31))
        let rounds: [Double] = [0.25, 1, 3, 8, 15, 30, 120]
        for skill in Skill.allCases {
            for iteration in 0..<1000 {
                let roundSeconds = rounds[iteration % rounds.count]
                guard let seconds = bot.attempt(skill: skill, roundSeconds: roundSeconds) else { continue }
                XCTAssertGreaterThan(seconds, 0, "زمن غير موجب")
                XCTAssertLessThan(seconds, roundSeconds, "أجاب بعد انتهاء الجولة")
                XCTAssertTrue(seconds.isFinite)
            }
        }
    }

    func testQuizAnswerRateMatchesSkill() {
        let trials = 3000

        func hitRate(_ skill: Skill, seed: UInt64) -> Double {
            let bot = TimedQuizBot(random: BotRandom(seed: seed))
            var hits = 0
            for _ in 0..<trials where bot.attempt(skill: skill, roundSeconds: 20) != nil {
                hits += 1
            }
            return Double(hits) / Double(trials)
        }

        let easy = hitRate(.easy, seed: 41)
        let normal = hitRate(.normal, seed: 42)
        let hard = hitRate(.hard, seed: 43)

        XCTAssertGreaterThan(easy, 0.25)
        XCTAssertLessThan(easy, 0.45)
        XCTAssertGreaterThan(normal, 0.50)
        XCTAssertLessThan(normal, 0.70)
        XCTAssertGreaterThan(hard, 0.75)
        // لا يقين أبدًا: البوت الذي يصيب دائمًا يقتل اللعبة.
        XCTAssertLessThan(hard, 0.95)
        XCTAssertLessThan(easy, normal)
        XCTAssertLessThan(normal, hard)
    }

    func testQuizAccuracyIsNeverCertainEvenIfConfigured() {
        let bot = TimedQuizBot(random: BotRandom(seed: 44),
                               easyAccuracy: 1.0,
                               normalAccuracy: 2.0,
                               hardAccuracy: .infinity)
        for skill in Skill.allCases {
            XCTAssertLessThan(bot.accuracy(for: skill), 1.0)
        }
        var misses = 0
        for _ in 0..<2000 where bot.attempt(skill: .hard, roundSeconds: 10) == nil {
            misses += 1
        }
        XCTAssertGreaterThan(misses, 0, "حتى أعلى إعداد يجب أن يخطئ أحيانًا")
    }

    func testQuizInvalidRoundSecondsReturnsNil() {
        let bot = TimedQuizBot(random: BotRandom(seed: 45))
        for skill in Skill.allCases {
            for _ in 0..<50 {
                XCTAssertNil(bot.attempt(skill: skill, roundSeconds: 0))
                XCTAssertNil(bot.attempt(skill: skill, roundSeconds: -12))
                XCTAssertNil(bot.attempt(skill: skill, roundSeconds: .nan))
                XCTAssertNil(bot.attempt(skill: skill, roundSeconds: .infinity))
            }
        }
    }

    func testQuizIsFasterOnHigherSkill() {
        func averageAnswer(_ skill: Skill, seed: UInt64) -> Double {
            let bot = TimedQuizBot(random: BotRandom(seed: seed))
            var total = 0.0
            var count = 0
            for _ in 0..<4000 {
                if let seconds = bot.attempt(skill: skill, roundSeconds: 20) {
                    total += seconds
                    count += 1
                }
            }
            return count == 0 ? 0 : total / Double(count)
        }

        let easy = averageAnswer(.easy, seed: 51)
        let normal = averageAnswer(.normal, seed: 52)
        let hard = averageAnswer(.hard, seed: 53)
        XCTAssertGreaterThan(easy, normal)
        XCTAssertGreaterThan(normal, hard)
    }

    func testQuizIsDeterministicUnderSameSeed() {
        let first = TimedQuizBot(random: BotRandom(seed: 909))
        let second = TimedQuizBot(random: BotRandom(seed: 909))
        for _ in 0..<300 {
            let a = first.attempt(skill: .normal, roundSeconds: 12)
            let b = second.attempt(skill: .normal, roundSeconds: 12)
            XCTAssertEqual(a, b)
        }
    }

    // MARK: - نقطة الوصول الموحّدة

    func testBotsEntryPointsAreWired() {
        XCTAssertTrue(Bots.board is MinimaxBoardBot)
        XCTAssertTrue(Bots.duel is PatternDuelBot)
        XCTAssertTrue(Bots.quiz is TimedQuizBot)
        XCTAssertFalse(Bots.displayName.isEmpty)
    }
}

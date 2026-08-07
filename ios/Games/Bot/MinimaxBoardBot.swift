import Foundation

/// خصم آلي للوحات: إكس أو (3×3) وأربعة في صف (7×6).
///
/// اللوحتان تمرّان بنفس الدالة، والفرق بينهما في ثلاثة أشياء فقط:
/// 1. **شكل الحركة**: إكس أو وضع حرّ في أي خانة فارغة، وأربعة في صف اختيار
///    عمود تسقط فيه القطعة إلى أدنى خانة فارغة.
/// 2. **حجم الشجرة**: 9 خانات تُحلّ كاملة، و42 خانة لا تُحلّ فنقطع البحث بعمق
///    محدود ونقيس الأوراق بدالّة تقييم.
/// 3. **طول خط الفوز**: 3 مقابل 4.
///
/// اصطلاح الفهارس: `index = row * cols + col`، والصف 0 أعلى اللوحة، فالجاذبية
/// تدفع القطعة نحو أكبر صف فارغ في العمود. القيمة المعادة في أربعة في صف هي
/// **خانة الهبوط** لا رقم العمود (العقد يطلب فهرس خانة)، والعمود يُستخرج منها
/// بـ `index % cols`.
public struct MinimaxBoardBot: BoardOpponent {
    /// مصدر العشوائية — يُحقن كي يصير سلوك الصعوبة قابلًا للاختبار.
    public let random: BotRandom

    public init(random: BotRandom = BotRandom()) {
        self.random = random
    }

    // MARK: - ثوابت

    /// قيمة الفوز؛ أصغر بكثير من `Int.max` كي لا تفيض عند الطرح.
    private static let winScore = 1_000_000

    /// فوق هذا الحجم نمتنع عن البحث — لوحة غير متوقّعة يجب ألا تجمّد الواجهة.
    private static let searchCellLimit = 64

    // MARK: - الواجهة

    public func move(board: [String?], cols: Int, me: String, rival: String, skill: Skill) -> Int? {
        // لوحة غير صالحة: لا انهيار، لا نقلة.
        guard cols > 0, !board.isEmpty, board.count % cols == 0 else { return nil }
        let rows = board.count / cols
        guard rows > 0 else { return nil }

        // رمزان متطابقان يجعلان اللعبة بلا معنى؛ نلعب نقلة مشروعة ونخرج.
        guard me != rival else { return randomEmpty(in: board) }

        // لوحة أضخم من أن تُبحث: نقلة مشروعة أفضل من تجميد الشاشة.
        guard board.count <= Self.searchCellLimit else { return randomEmpty(in: board) }

        // 0 فارغ، 1 نحن، 2 الخصم، 3 محتلّ بقيمة لا نعرفها (يعطّل الخط للطرفين).
        var cells = [Int8](repeating: 0, count: board.count)
        for index in board.indices {
            guard let value = board[index] else { continue }
            if value == me {
                cells[index] = 1
            } else if value == rival {
                cells[index] = 2
            } else {
                cells[index] = 3
            }
        }

        let geo = Geometry(rows: rows, cols: cols)
        let moves = legalMoves(cells, geo)
        guard !moves.isEmpty else { return nil }

        // الصعوبة تُطبَّق بالخطأ المتعمّد لا بتقليل الذكاء وحده: خصم لا يُهزم في
        // كل المستويات يطرد اللاعب المبتدئ من اللعبة.
        let blunderChance: Double
        switch skill {
        case .easy: blunderChance = 0.75
        case .normal: blunderChance = 0.35
        case .hard: blunderChance = 0.0
        }
        if blunderChance > 0, random.double() < blunderChance {
            return random.pick(moves) ?? moves[0]
        }

        let depth = searchDepth(skill: skill, geo: geo, moveCount: moves.count, cellCount: cells.count)

        var bestScore = Int.min
        var bestMoves: [Int] = []
        for candidate in moves {
            cells[candidate] = 1
            let score: Int
            if Geometry.isWin(cells, at: candidate, player: 1, geo: geo) {
                score = Self.winScore
            } else {
                // نافذة كاملة عند الجذر: القصّ هنا يشوّه قيم النقلات المتعادلة
                // فتضيع إمكانية الاختيار العشوائي بينها.
                score = minimize(&cells, geo: geo, depth: depth - 1, ply: 1,
                                 alpha: Int.min + 1, beta: Int.max - 1)
            }
            cells[candidate] = 0

            if score > bestScore {
                bestScore = score
                bestMoves = [candidate]
            } else if score == bestScore {
                bestMoves.append(candidate)
            }
        }

        return random.pick(bestMoves) ?? moves[0]
    }

    // MARK: - العمق

    private func searchDepth(skill: Skill, geo: Geometry, moveCount: Int, cellCount: Int) -> Int {
        if geo.gravity {
            // 42 خانة لا تُحلّ كاملة؛ 4–6 أنصاف نقلة حسب الصعوبة.
            switch skill {
            case .easy: return 4
            case .normal: return 5
            case .hard: return 6
            }
        }
        if cellCount <= 9 {
            // الشجرة صغيرة: الحلّ الكامل ممكن، فالصعب لا يُهزم أبدًا.
            return moveCount
        }
        return min(moveCount, 5)
    }

    // MARK: - البحث (ألفا–بيتا)

    /// نبني ونتراجع على نفس المصفوفة (`inout`) بدل نسخها في كل عقدة —
    /// النسخ في كل عقدة يضاعف زمن البحث بلا فائدة.
    private func maximize(_ cells: inout [Int8], geo: Geometry, depth: Int, ply: Int,
                          alpha: Int, beta: Int) -> Int {
        let moves = legalMoves(cells, geo)
        if moves.isEmpty { return 0 }
        if depth <= 0 { return Geometry.evaluate(cells, geo: geo) }

        var alpha = alpha
        var best = Int.min + 1
        for candidate in moves {
            cells[candidate] = 1
            let score: Int
            if Geometry.isWin(cells, at: candidate, player: 1, geo: geo) {
                // الفوز الأسرع أثمن: يمنع البوت من تأجيل فوز مضمون.
                score = Self.winScore - ply
            } else {
                score = minimize(&cells, geo: geo, depth: depth - 1, ply: ply + 1,
                                 alpha: alpha, beta: beta)
            }
            cells[candidate] = 0

            if score > best { best = score }
            if best > alpha { alpha = best }
            if alpha >= beta { break }
        }
        return best
    }

    private func minimize(_ cells: inout [Int8], geo: Geometry, depth: Int, ply: Int,
                          alpha: Int, beta: Int) -> Int {
        let moves = legalMoves(cells, geo)
        if moves.isEmpty { return 0 }
        if depth <= 0 { return Geometry.evaluate(cells, geo: geo) }

        var beta = beta
        var best = Int.max - 1
        for candidate in moves {
            cells[candidate] = 2
            let score: Int
            if Geometry.isWin(cells, at: candidate, player: 2, geo: geo) {
                score = -Self.winScore + ply
            } else {
                score = maximize(&cells, geo: geo, depth: depth - 1, ply: ply + 1,
                                 alpha: alpha, beta: beta)
            }
            cells[candidate] = 0

            if score < best { best = score }
            if best < beta { beta = best }
            if alpha >= beta { break }
        }
        return best
    }

    // MARK: - النقلات المشروعة

    /// تعيد **فهارس خانات**: في لوحة الجاذبية خانة الهبوط لكل عمود غير ممتلئ،
    /// وفي اللوحة الحرّة كل خانة فارغة.
    private func legalMoves(_ cells: [Int8], _ geo: Geometry) -> [Int] {
        var result: [Int] = []
        if geo.gravity {
            result.reserveCapacity(geo.cols)
            for col in geo.columnOrder {
                var row = geo.rows - 1
                while row >= 0 {
                    let index = row * geo.cols + col
                    if cells[index] == 0 {
                        result.append(index)
                        break
                    }
                    row -= 1
                }
            }
            return result
        }
        result.reserveCapacity(cells.count)
        for index in geo.cellOrder where cells[index] == 0 {
            result.append(index)
        }
        return result
    }

    private func randomEmpty(in board: [String?]) -> Int? {
        var empties: [Int] = []
        for index in board.indices where board[index] == nil {
            empties.append(index)
        }
        return random.pick(empties)
    }

    // MARK: - هندسة اللوحة

    /// صنف لا بنية: يُبنى مرّة لكل نقلة ويُمرَّر بمرجع واحد عبر آلاف العقد.
    final class Geometry {
        let rows: Int
        let cols: Int
        let winLength: Int
        let gravity: Bool
        /// كل نافذة قائمة فهارس بطول `winLength` قد تصير خط فوز.
        let windows: [[Int]]
        /// خانة ← أرقام النوافذ المارّة بها (لفحص فوز موضعي رخيص).
        let windowsByCell: [[Int]]
        /// أفضلية مركزية جاهزة لكل خانة، تُحسب مرّة لا في كل ورقة.
        let centerBonus: [Int]
        let columnOrder: [Int]
        let cellOrder: [Int]

        init(rows: Int, cols: Int) {
            self.rows = rows
            self.cols = cols
            // 3×3 ← ثلاثة على التوالي. 7×6 ← أربعة. أي لوحة أخرى تأخذ أقرب قاعدة معقولة.
            let length = max(3, min(4, min(rows, cols)))
            self.winLength = length
            // الجاذبية تخصّ عائلة "أربعة في صف" (7×6 وما شابهها)، لا شبكة 3×3.
            self.gravity = (cols >= 5 && rows >= 5)

            var builtWindows: [[Int]] = []
            var builtByCell = [[Int]](repeating: [], count: rows * cols)
            let directions = [(0, 1), (1, 0), (1, 1), (1, -1)]

            for row in 0..<rows {
                for col in 0..<cols {
                    for direction in directions {
                        let endRow = row + (length - 1) * direction.0
                        let endCol = col + (length - 1) * direction.1
                        if endRow < 0 || endRow >= rows || endCol < 0 || endCol >= cols { continue }
                        var window: [Int] = []
                        window.reserveCapacity(length)
                        for step in 0..<length {
                            window.append((row + step * direction.0) * cols + (col + step * direction.1))
                        }
                        let id = builtWindows.count
                        builtWindows.append(window)
                        for cell in window {
                            builtByCell[cell].append(id)
                        }
                    }
                }
            }
            self.windows = builtWindows
            self.windowsByCell = builtByCell

            // الأعمدة الوسطى تشارك في خطوط أكثر، فامتلاكها ميزة بنيوية.
            let center = (cols - 1) / 2
            let span = max(1, cols / 2)
            var bonus = [Int](repeating: 0, count: rows * cols)
            for index in 0..<(rows * cols) {
                bonus[index] = max(0, span - abs((index % cols) - center)) * 3
            }
            self.centerBonus = bonus

            // ترتيب النقلات من الوسط للخارج يحسّن قصّ ألفا–بيتا كثيرًا.
            let centerColumn = Double(cols - 1) / 2.0
            let centerRow = Double(rows - 1) / 2.0
            self.columnOrder = (0..<cols).sorted {
                abs(Double($0) - centerColumn) < abs(Double($1) - centerColumn)
            }
            self.cellOrder = (0..<(rows * cols)).sorted { lhs, rhs in
                let lhsCost = abs(Double(lhs % cols) - centerColumn) + abs(Double(lhs / cols) - centerRow)
                let rhsCost = abs(Double(rhs % cols) - centerColumn) + abs(Double(rhs / cols) - centerRow)
                return lhsCost < rhsCost
            }
        }

        static func isWin(_ cells: [Int8], at index: Int, player: Int8, geo: Geometry) -> Bool {
            guard index >= 0, index < geo.windowsByCell.count else { return false }
            for windowID in geo.windowsByCell[index] {
                var complete = true
                for cell in geo.windows[windowID] where cells[cell] != player {
                    complete = false
                    break
                }
                if complete { return true }
            }
            return false
        }

        /// تقييم من منظور اللاعب 1: الخطوط المفتوحة بطول 2 و3، وأفضلية الوسط.
        static func evaluate(_ cells: [Int8], geo: Geometry) -> Int {
            var score = 0

            for window in geo.windows {
                var mine = 0
                var theirs = 0
                var dead = false
                for cell in window {
                    let value = cells[cell]
                    if value == 1 {
                        mine += 1
                    } else if value == 2 {
                        theirs += 1
                    } else if value == 3 {
                        dead = true
                        break
                    }
                }
                if dead { continue }
                // خطّ فيه الطرفان مغلق: لا أحد يكمله.
                if mine > 0 && theirs > 0 { continue }
                if mine > 0 {
                    score += lineWeight(mine)
                } else if theirs > 0 {
                    // ميل دفاعي طفيف: تهديد الخصم أثقل قليلًا من فرصتنا المكافئة.
                    score -= (lineWeight(theirs) * 11) / 10
                }
            }

            for index in 0..<cells.count {
                let value = cells[index]
                if value == 1 {
                    score += geo.centerBonus[index]
                } else if value == 2 {
                    score -= geo.centerBonus[index]
                }
            }

            return score
        }

        static func lineWeight(_ count: Int) -> Int {
            switch count {
            case 1: return 1
            case 2: return 10
            case 3: return 100
            default: return count <= 0 ? 0 : 1000
            }
        }
    }
}

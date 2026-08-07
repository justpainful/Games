import SwiftUI

/// نتيجة مباراة منفردة.
struct GameResult: Hashable, Sendable {
    enum Outcome { case win, loss, draw }

    let gameTitle: String
    let mineLabel: String
    let rivalLabel: String
    let mine: Int
    let rival: Int
    /// سطر يشرح النتيجة (عدد الجولات، سبب الفوز…) — اختياري.
    let note: String?

    init(gameTitle: String,
         mine: Int,
         rival: Int,
         mineLabel: String = "أنت",
         rivalLabel: String = Bots.displayName,
         note: String? = nil) {
        self.gameTitle = gameTitle
        self.mine = mine
        self.rival = rival
        self.mineLabel = mineLabel
        self.rivalLabel = rivalLabel
        self.note = note
    }

    var outcome: Outcome {
        if mine > rival { return .win }
        if mine < rival { return .loss }
        return .draw
    }

    var verdict: String {
        switch outcome {
        case .win: return "فزت!"
        case .loss: return "فاز \(Bots.displayName)"
        case .draw: return "تعادل"
        }
    }

    var symbol: String {
        switch outcome {
        case .win: return "crown.fill"
        case .loss: return "cpu.fill"
        case .draw: return "equal.circle.fill"
        }
    }
}

/// شاشة النتيجة النهائية.
///
/// تُعرض **داخل** شاشة اللعبة لا كشاشة مدفوعة: دفع شاشة جديدة يجعل زر الرجوع
/// يعيد اللاعب إلى لوحة انتهت، وهو أسوأ ما يمكن أن يراه بعد آخر جولة.
struct ResultView: View {
    let result: GameResult
    var onReplay: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Card(shadow: result.outcome == .win ? Ink.redDeep : Ink.ink) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: result.symbol)
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(result.verdict)
                            .font(.display(Type.title))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                    }

                    HStack(spacing: 12) {
                        ScoreTile(name: result.mineLabel,
                                  score: result.mine,
                                  highlighted: result.outcome == .win)
                        ScoreTile(name: result.rivalLabel,
                                  score: result.rival,
                                  highlighted: result.outcome == .loss)
                    }

                    if let note = result.note {
                        Text(note)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }

            ActionButton("العب مرة أخرى", systemImage: "arrow.counterclockwise", kind: .hero) {
                onReplay()
            }

            ActionButton("رجوع", systemImage: "chevron.backward", kind: .solid) {
                dismiss()
            }
        }
    }
}

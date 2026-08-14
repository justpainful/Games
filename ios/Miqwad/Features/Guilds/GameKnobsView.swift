import SwiftUI

/// مقابض لعبة واحدة.
///
/// ————————————————— لماذا لا تُعرض إلا لمن أعلنها —————————————————
///
/// كان في قاعدة البيانات عمود إعدادات مفتوح، يُكتب فيه أي حقل ولا تقرؤه لعبة.
/// فالمقبض يُضبط ويُعرض مضبوطًا ولا يتغيّر شيء في اللعب. والقائمة هنا تأتي من
/// الخادم لا من التطبيق، والخادم يبنيها من تعريف اللعبة نفسه، فما يظهر على
/// الشاشة هو ما تقرؤه اللعبة فعلًا ولا شيء غيره.
struct GameKnobsView: View {
    let game: GameSetting

    @Environment(Hub.self) private var hub
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Metric.spaceSm) {
                    TopBar(game.name, trailing: hub.checking ? "…" : nil)

                    Card {
                        Text(game.tagline)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink.opacity(0.75))
                    }

                    // القائمة الحيّة من الحالة لا من النسخة الممرَّرة: بعد كل
                    // تعديل يعود الخادم بالسيرفر كاملًا، والقيمة الجديدة فيه
                    ForEach(live) { knob in
                        knobCard(knob)
                    }

                    if live.isEmpty {
                        Card {
                            Text("هذي اللعبة ما تقبل ضبطًا. ما فيها مقبض يقرؤه تشغيلها.")
                                .font(.bodyAr(Type.body))
                                .foregroundStyle(Ink.ink.opacity(0.7))
                        }
                    }

                    if let trouble = hub.trouble {
                        Text(trouble)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.redDeep)
                    }
                }
                .padding(Metric.spaceSm)
            }
            .background(Ink.paper)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("تم") { dismiss() }
                        .font(.bodyArBold(Type.label))
                }
            }
        }
    }

    private var live: [Knob] {
        hub.opened?.games.first { $0.key == game.key }?.tuning ?? game.tuning
    }

    private func knobCard(_ knob: Knob) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(knob.name)
                        .font(.bodyArBold(Type.body))
                        .foregroundStyle(Ink.ink)
                    Spacer()
                    Text("\(knob.value) \(knob.unit)")
                        .font(.display(26))
                        .foregroundStyle(Ink.redDeep)
                }

                Text(knob.about)
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink.opacity(0.65))
                    .lineSpacing(4)

                // منزلق لا حقل رقم: المدى معروف من الخادم، والمنزلق لا يسمح
                // بالخروج عنه أصلًا فلا تُرفض قيمة بعد كتابتها
                Slider(
                    value: Binding(
                        get: { Double(knob.value) },
                        set: { fresh in send(knob, Int(fresh.rounded())) }
                    ),
                    in: Double(knob.min)...Double(knob.max),
                    step: 1
                )
                .tint(Ink.red)

                HStack {
                    Text("\(knob.min)")
                    Spacer()
                    Text("\(knob.max)")
                }
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink.opacity(0.45))
            }
        }
    }

    /// يُرسل عند استقرار القيمة لا مع كل بكسل.
    ///
    /// جرّ المنزلق من 10 إلى 25 يمرّ بخمس عشرة قيمة، وإرسال كل واحدة يعني خمسة
    /// عشر طلبًا وخمسة عشر كتابة في القاعدة لقرار واحد.
    private func send(_ knob: Knob, _ value: Int) {
        guard value != knob.value else { return }
        Task { await hub.change(.knob(game.key, knob.key, value)) }
    }
}

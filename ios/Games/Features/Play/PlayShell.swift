import SwiftUI

// ————— التنقّل —————

/// مسار التنقّل بين شاشات الألعاب.
///
/// المسار يحمل **مفتاح اللعبة** لا `GameInfo` كاملة: مكدّس التنقّل يُخزَّن
/// ويُقارن، وحمل بنية كاملة فيه يربط حالة الشاشة بشكل الكتالوج، فيكفي المفتاح
/// وتُقرأ اللعبة منه عند العرض.
enum PlayRoute: Hashable {
    case detail(String)
    case solo(String)
    case lobby(String)
}

/// إعدادات الخصم الآلي المحفوظة على الجهاز.
enum BotSettings {
    static let skillKey = "botSkill"

    static var skill: Skill {
        Skill(rawValue: UserDefaults.standard.string(forKey: skillKey) ?? "") ?? .normal
    }
}

/// يحوّل المسار إلى شاشة. مشترك بين «الألعاب» و«منفرد» فلا يتكرّر الجدول مرتين.
struct PlayDestination: View {
    let route: PlayRoute
    @Binding var path: [PlayRoute]

    var body: some View {
        switch route {
        case .detail(let id):
            if let game = Catalog.game(id) {
                GameDetailView(game: game, path: $path)
            } else {
                MissingGameView()
            }
        case .solo(let id):
            if let game = Catalog.game(id) {
                SoloPlayView(game: game)
            } else {
                MissingGameView()
            }
        case .lobby(let id):
            if let game = Catalog.game(id) {
                LobbyView(game: game)
            } else {
                MissingGameView()
            }
        }
    }
}

/// يختار شاشة اللعب المنفرد حسب نوع اللعبة.
struct SoloPlayView: View {
    let game: GameInfo

    var body: some View {
        switch game.mode {
        case .typing:
            TypingGameView(game: game)
        case .board:
            BoardGameView(game: game)
        case .duel:
            DuelGameView(game: game)
        case .wheel, .poll, .phase, .teams:
            NotSoloableView(game: game)
        }
    }
}

/// لعبة لا تُلعب وحدك — تُعرض رسالة بدل شاشة فارغة.
struct NotSoloableView: View {
    let game: GameInfo

    var body: some View {
        GameScreen(title: game.title) {
            NoticeCard(
                symbol: "person.3.fill",
                title: "هذه اللعبة جماعية",
                body: "«\(game.title)» تحتاج لاعبين آخرين، ولا يمكن لعبها ضد الخصم الآلي. العبها في سيرفرك مع أصدقائك."
            )
        }
    }
}

/// مفتاح لعبة غير معروف — لا يجب أن يحدث، ولا يجوز أن يُسقط التطبيق.
struct MissingGameView: View {
    var body: some View {
        GameScreen(title: "غير متاح") {
            NoticeCard(
                symbol: "questionmark.circle.fill",
                title: "لم نجد هذه اللعبة",
                body: "ربما حُدّث الكتالوج. ارجع للقائمة واختر لعبة أخرى."
            )
        }
    }
}

// ————— هيكل الشاشة —————

/// خلفية المشهد + الشريط العلوي — مشتركة بين كل شاشات اللعب.
///
/// المحتوى داخل `ScrollView` دائمًا: الشاشات الصغيرة مع لوحة مفتاح مفتوحة تقصّ
/// آخر عنصر، وقصّ زر الإجابة يعني لعبة لا تُلعب.
struct GameScreen<Content: View>: View {
    let title: String
    var trailing: String?
    @ViewBuilder var content: () -> Content

    init(title: String, trailing: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.trailing = trailing
        self.content = content
    }

    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    TopBar(title, trailing: trailing)
                    content()
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 40)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }
}

/// عنوان قسم بين قوسين حمراوين (DESIGN.md §5).
///
/// الأقواس والنص في `Text` واحد بالجمع لا في ثلاثة عناصر: العنصر المنفصل الذي
/// يحمل «`«`» وحده محرف محايد، فيأخذ اتجاه الفقرة وينقلب شكله.
struct SectionTitle: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        (Text("«").foregroundStyle(Ink.red)
         + Text(text).foregroundStyle(Ink.ink)
         + Text("»").foregroundStyle(Ink.red))
            .font(.displaySoft(Type.title))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// الزر الأساسي في المشروع: حد أسود سميك وظل صلب.
struct ActionButton: View {
    enum Kind {
        /// الفعل البطل — أصفر بظل أحمر عميق (DESIGN.md §5).
        case hero
        /// فعل ثانوي — أحمر بنص كريمي.
        case solid
        /// فعل هادئ — سطح كريمي.
        case quiet
    }

    let title: String
    var systemImage: String?
    var kind: Kind = .hero
    var isEnabled: Bool = true
    let action: () -> Void

    init(_ title: String, systemImage: String? = nil, kind: Kind = .hero,
         isEnabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.kind = kind
        self.isEnabled = isEnabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 17, weight: .bold))
                }
                Text(title)
                    .font(.bodyArBold(Type.body))
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(fill))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(shadow, lift: 5, radius: 16)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    private var fill: Color {
        guard isEnabled else { return Ink.paperTint }
        switch kind {
        case .hero: return Ink.yellow
        case .solid: return Ink.red
        case .quiet: return Ink.surface
        }
    }

    private var foreground: Color {
        guard isEnabled else { return Ink.ink }
        switch kind {
        case .hero: return Ink.ink
        case .solid: return Ink.cream
        case .quiet: return Ink.ink
        }
    }

    private var shadow: Color {
        guard isEnabled else { return Ink.ink }
        switch kind {
        case .hero: return Ink.redDeep
        case .solid: return Ink.ink
        case .quiet: return Ink.ink
        }
    }
}

/// بطاقة رسالة — حالة فارغة أو تنبيه.
struct NoticeCard: View {
    let symbol: String
    let title: String
    let message: String

    init(symbol: String, title: String, body: String) {
        self.symbol = symbol
        self.title = title
        self.message = body
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: symbol)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text(title)
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.ink)
                }
                Text(message)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

/// لوحة نتيجة صغيرة — اسم ورقم. رقم واحد في كل بطاقة عمدًا: رقمان في نص واحد
/// يفصلهما محرف محايد ينقلب ترتيبهما تحت RTL.
struct ScoreTile: View {
    let name: String
    let score: Int
    var highlighted: Bool

    var body: some View {
        VStack(spacing: 6) {
            Text(name.bidiIsolated)
                .font(.bodyArBold(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("\(score)")
                .font(.display(Type.display))
                .foregroundStyle(highlighted ? Ink.red : Ink.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(highlighted ? Ink.yellow : Ink.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(highlighted ? Ink.redDeep : Ink.ink, lift: 5, radius: 16)
    }
}

/// شريط الوقت المتبقّي — يمتلئ من جهة بداية السطر (اليمين تحت RTL).
struct TimerBar: View {
    let remaining: Double
    let total: Double

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, remaining / total))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "timer")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Ink.ink)
                Text("\(Int(remaining.rounded(.up)))")
                    .font(.bodyArBold(Type.meta))
                    .foregroundStyle(Ink.ink)
                    .monospacedDigit()
                Text("ثانية")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink)
                Spacer(minLength: 0)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Ink.paperTint)
                    Capsule()
                        .fill(fraction > 0.25 ? Ink.red : Ink.redDeep)
                        .frame(width: max(0, geo.size.width * fraction))
                }
            }
            .frame(height: 12)
            .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
        }
    }
}
